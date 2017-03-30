const EXPORTED_SYMBOLS = [
    "GM_addStyle", "GM_console", "GM_Resources", "GM_ScriptLogger"];

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;
var Cr = Components.results;

Cu.import("chrome://greasemonkey-modules/content/constants.js");

Cu.import("resource://gre/modules/Services.jsm");

Cu.import("chrome://greasemonkey-modules/content/prefmanager.js");
Cu.import("chrome://greasemonkey-modules/content/util.js");


// \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ //

function GM_addStyle(doc, css) {
  let head = doc.getElementsByTagName("head")[0];
  if (head) {
    let style = doc.createElement("style");

    style.textContent = css;
    style.type = "text/css";
    head.appendChild(style);

    return style;
  }

  return null;
}

// \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ //

function GM_console(script) {
  // based on http://www.getfirebug.com/firebug/firebugx.js
  let names = [
    "debug", "warn", "error", "info", "assert", "dir", "dirxml",
    "group", "groupEnd", "time", "timeEnd", "count", "trace", "profile",
    "profileEnd"
  ];

  for (let i = 0, iLen = names.length; i < iLen; i++) {
    let name = names[i];
    this[name] = function () {};
  }

  // Important to use this private variable so that user scripts
  // can't make this call something else by redefining <this> or <logger>.
  var logger = new GM_ScriptLogger(script);
  this.log = function () {
    logger.log(
      Array.prototype.slice.apply(arguments).join("\n")
    );
  };
}

GM_console.prototype.log = function () {};

// \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ //

function GM_Resources(script) {
  this.script = script;
}

GM_Resources.prototype.getResourceURL = function (aScript, name) {
  // Verify the existence of the resource.
  let dep = this._getDep(name);
  return [
    GM_CONSTANTS.addonScriptProtocolScheme + ":",
    aScript.uuid,
    GM_CONSTANTS.addonScriptProtocolSeparator, name
  ].join("");
};

GM_Resources.prototype.getResourceText = function (sandbox, name, responseType) {
  let dep = this._getDep(name);
  if (dep.textContent !== undefined) {
    return dep.textContent;
  }
  return Cu.cloneInto(GM_util.fileXhr(
      dep.file_url, "text/plain", responseType), sandbox);
};

GM_Resources.prototype._getDep = function (name) {
  let resources = this.script.resources;
  for (var i = 0, iLen = resources.length; i < iLen; i++) {
    let resource = resources[i];
    if (resource.name == name) {
      return resource;
    }
  }

  throw new Error(
      GM_CONSTANTS.localeStringBundle.createBundle(
          GM_CONSTANTS.localeGreasemonkeyProperties)
          .GetStringFromName("error.missingResource")
          .replace("%1", name)
      );
};

// \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ //

function GM_ScriptLogger(script) {
  let namespace = script.namespace;

  if (namespace.substring(namespace.length - 1) != "/") {
    namespace += "/";
  }

  this.prefix = [namespace, script.name, ": "].join("");
}

GM_ScriptLogger.prototype.consoleService = Cc["@mozilla.org/consoleservice;1"]
    .getService(Ci.nsIConsoleService);

GM_ScriptLogger.prototype.log = function (message) {
  // https://developer.mozilla.org/en-US/docs/XPCOM_Interface_Reference/nsIConsoleService#logStringMessage()
  // - wstring / wide string
  this.consoleService.logStringMessage((this.prefix + "\n" + message)
      .replace(new RegExp("\\0", "g"), ""));
};
