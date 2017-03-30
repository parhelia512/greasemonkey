///////////////// Component-global "Constants" and "Variables" /////////////////

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("chrome://greasemonkey-modules/content/constants.js");

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

Cu.import("resource://gre/modules/AddonManager.jsm");

Cu.import("chrome://greasemonkey-modules/content/ipcscript.js");
Cu.import("chrome://greasemonkey-modules/content/menucommand.js");
Cu.import("chrome://greasemonkey-modules/content/prefmanager.js");
Cu.import("chrome://greasemonkey-modules/content/storageBack.js");
Cu.import("chrome://greasemonkey-modules/content/sync.js");
Cu.import("chrome://greasemonkey-modules/content/util.js");


const DIRECTORY_TEMP = GM_CONSTANTS.directoryService
    .get(GM_CONSTANTS.directoryServiceTempName, Ci.nsIFile);
const CACHE_SIZE = 1024;

var gGreasemonkeyVersion = "unknown";
var gStartupHasRun = false;

/////////////////////// Component-global Helper Functions //////////////////////

function shutdown(aService) {
  aService.closeAllScriptValStores();
}

function startup(aService) {
  if (gStartupHasRun) {
    return undefined;
  }
  gStartupHasRun = true;

  GM_CONSTANTS.jsSubScriptLoader.loadSubScript(
      "chrome://global/content/XPCNativeWrapper.js");

  GM_CONSTANTS.jsSubScriptLoader.loadSubScript(
      "chrome://greasemonkey/content/config.js");
  GM_CONSTANTS.jsSubScriptLoader.loadSubScript(
      "chrome://greasemonkey/content/third-party/mpl-utils.js");

  // Most incoming messages go to the "global" message manager.
  let scriptValHandler = aService.handleScriptValMsg.bind(aService);
  Services.mm.addMessageListener(
      "greasemonkey:scriptVal-delete", scriptValHandler);
  Services.mm.addMessageListener(
      "greasemonkey:scriptVal-get", scriptValHandler);
  Services.mm.addMessageListener(
      "greasemonkey:scriptVal-list", scriptValHandler);
  Services.mm.addMessageListener(
      "greasemonkey:scriptVal-set", scriptValHandler);

  // Others go to the "parent" message manager.
  Services.ppmm.addMessageListener(
      "greasemonkey:scripts-update", function (message) {
        return aService.scriptUpdateData();
      });
  Services.ppmm.addMessageListener(
      "greasemonkey:broadcast-script-updates", function (message) {
        return aService.broadcastScriptUpdates();
      });
  Services.ppmm.addMessageListener(
      "greasemonkey:script-install", aService.scriptInstall.bind(aService));
  Services.ppmm.addMessageListener(
      "greasemonkey:url-is-temp-file", aService.urlIsTempFile.bind(aService));

  Services.mm.loadFrameScript(
      "chrome://greasemonkey/content/framescript.js", true);

  // Beam down initial set of scripts.
  aService.broadcastScriptUpdates();

  // Notification is async; send the scripts again once we have our version.
  AddonManager.getAddonByID(GM_CONSTANTS.addonGUID, function (addon) {
    gGreasemonkeyVersion = "" + addon.version;
    aService.broadcastScriptUpdates();
  });

  // Beam down on updates.
  aService.config.addObserver({
    "notifyEvent": function (script, event, data) {
      if ([
        "cludes",
        "edit-enabled",
        "install",
        "modified",
        "move",
        "uninstall",
      ].some(function (e) {
        return e == event;
      })) {
        aService.broadcastScriptUpdates();
      }
    }
  });

  Cu.import("chrome://greasemonkey-modules/content/requestObserver.js", {});
  Cu.import("chrome://greasemonkey-modules/content/responseObserver.js", {});

  Services.obs.addObserver(aService, "quit-application", false);

  // Import this once, early, so that enqueued deletes can happen.
  Cu.import("chrome://greasemonkey-modules/content/util/enqueueRemoveFile.js");
}

/////////////////////////////////// Service ////////////////////////////////////

function service() {
  this.filename = Components.stack.filename;
  this.scriptValStores = {};
  this.wrappedJSObject = this;
}

////////////////////////////////// Constants ///////////////////////////////////

service.prototype.classDescription = GM_CONSTANTS.addonServiceClassDescription;
service.prototype.classID = GM_CONSTANTS.addonServiceClassID;
service.prototype.contractID = GM_CONSTANTS.addonServiceContractID;
service.prototype.QueryInterface = XPCOMUtils.generateQI([Ci.nsIObserver]);

///////////////////////////////// nsIObserver //////////////////////////////////

service.prototype.observe = function (aSubject, aTopic, aData) {
  switch (aTopic) {
    case "profile-after-change":
      startup(this);
      break;
    case "quit-application":
      shutdown(this);
      break;
  }
};

///////////////////////////// Greasemonkey Service /////////////////////////////

service.prototype._config = null;
Object.defineProperty(service.prototype, "config", {
  "get": function service_getConfig() {
    if (!this._config) {
      // First guarantee instantiation and existence.
      // So that anything, including stuff inside i.e. config._load(),
      // can call i.e. config._changed().
      this._config = new Config();
      // Then initialize.
      this._config.initialize();
    }
    return this._config;
  },
  "enumerable": true,
});

service.prototype.scriptUpdateData = function () {
  let ipcScripts = this.config.scripts.map(function (script) {
    return new IPCScript(script, gGreasemonkeyVersion);
  });
  let excludes = this.config._globalExcludes;
  return {
    "globalExcludes": excludes,
    "scripts": ipcScripts,
  };
};

service.prototype.broadcastScriptUpdates = function () {
  // Check if initialProcessData is supported, else child will use sync message.
  let data = this.scriptUpdateData();
  if (Services.ppmm.initialProcessData) {
    // Initial data for any new processes.
    Services.ppmm.initialProcessData["greasemonkey:scripts-update"] = data;
  }

  // Updates for existing ones.
  Services.ppmm.broadcastAsyncMessage("greasemonkey:scripts-update", data);
};

service.prototype.closeAllScriptValStores = function () {
  for (let scriptId in this.scriptValStores) {
    let scriptValStore = this.scriptValStores[scriptId];
    scriptValStore.close();
  }
};

service.prototype.scriptRefresh = function (url, windowId, browser) {
  if (!GM_util.getEnabled()) {
    return [];
  }
  if (!url) {
    return [];
  }
  if (!GM_util.isGreasemonkeyable(url)) {
    return [];
  }

  if (GM_prefRoot.getValue("enableScriptRefreshing")) {
    this.config.updateModifiedScripts("document-start", url, windowId, browser);
    this.config.updateModifiedScripts("document-end", url, windowId, browser);
    this.config.updateModifiedScripts("document-idle", url, windowId, browser);
  }
};

service.prototype.getStoreByScriptId = function (aScriptId) {
  if (typeof this.scriptValStores[aScriptId] == "undefined") {
    let script = this.config.getScriptById(aScriptId);
    this.scriptValStores[aScriptId] = new GM_ScriptStorageBack(script);
  }
  return this.scriptValStores[aScriptId];
};

var remoteCacheTracker = new Set();

service.prototype.remoteCached = function (key) {
  if (remoteCacheTracker.size > CACHE_SIZE) {
    Services.ppmm.broadcastAsyncMessage("greasemonkey:value-invalidate", {
      "keys": Array.from(remoteCacheTracker),
    });
    remoteCacheTracker.clear();
  }
  remoteCacheTracker.add(key);
};

service.prototype.invalidateRemoteValueCaches = function (key) {
  if (!remoteCacheTracker.has(key)) {
    return undefined;
  }

  remoteCacheTracker["delete"](key);
  Services.ppmm.broadcastAsyncMessage("greasemonkey:value-invalidate", {
    "keys": [key],
  });
};

service.prototype.handleScriptValMsg = function (aMessage) {
  let d = aMessage.data;
  let cacheKey = d.cacheKey;
  let scriptStore = this.getStoreByScriptId(d.scriptId);
  switch (aMessage.name) {
    case "greasemonkey:scriptVal-delete":
      scriptStore.deleteValue(d.name);
      this.invalidateRemoteValueCaches(cacheKey);
      return undefined;
    case "greasemonkey:scriptVal-get":
      if (d.willCache) {
        this.remoteCached(cacheKey);
      }
      return scriptStore.getValue(d.name);
    case "greasemonkey:scriptVal-list":
      return scriptStore.listValues();
    case "greasemonkey:scriptVal-set":
      scriptStore.setValue(d.name, d.val);
      this.invalidateRemoteValueCaches(cacheKey);
      return undefined;
    default:
      GM_util.logError(
          "Greasemonkey - Service handleScriptValMsg: "
          + 'Unknown message name "' + aMessage.name + '"');
      break;
  }
};

service.prototype.scriptInstall = function (aMessage) {
  GM_util.showInstallDialog(aMessage.data.url);
};

service.prototype.urlIsTempFile = function (aMessage) {
  let file;
  try {
    file = GM_CONSTANTS.fileProtocolHandler
        .getFileFromURLSpec(aMessage.data.url);
  } catch (e) {
    return false;
  }

  return DIRECTORY_TEMP.contains(file);
};

//////////////////////////// Component Registration ////////////////////////////

var NSGetFactory = XPCOMUtils.generateNSGetFactory([service]);
