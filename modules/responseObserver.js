"use strict";

var EXPORTED_SYMBOLS = [];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var Cu = Components.utils;

// try {
Cu.import("resource://gre/modules/Services.jsm");
// } catch (e) {
//   // Ignore.
// }

Cu.import("chrome://greasemonkey-modules/content/prefmanager.js");
Cu.import("chrome://greasemonkey-modules/content/third-party/convert2RegExp.js");
Cu.import("chrome://greasemonkey-modules/content/third-party/MatchPattern.js");
Cu.import("chrome://greasemonkey-modules/content/util.js");

var gStringBundle = Cc["@mozilla.org/intl/stringbundle;1"]
    .getService(Ci.nsIStringBundleService)
    .createBundle("chrome://greasemonkey/locale/greasemonkey.properties");

var gCorsCspName = "Greasemonkey CORS/CSP";

var gCorsCspObservers = [
  {
    "allow": true,
    "value": "http-on-examine-response",
  },
  {
    "allow": true,
    "value": "http-on-examine-cached-response",
  },
  {
    "allow": true,
    "value": "http-on-examine-merged-response",
  },
];

var gCorsCspListener = {
  "value": "onHeadersReceived",
};

var gCorsCspMessages = {
  "notDefined": {
    "content": "not defined",
    "value": "[" + "not defined" + "]",
  },
};

var gCorsCspType = "cors_csp";
var gCorsType = "cors";
var gCspType = "csp";
var gCorsCspOverridePrefSeparator = "_";
var gCorsCspOverridePrefSuffix = "override";
var gCorsCspOverridePrefItemsSeparator = ".";
var gCorsCspOverridePrefItemsValue = "value";
var gCorsCspOverrideExcludes = "excludes";
var gCorsCspOverrideIncludes = "includes";
var gCorsCspOverrideMatches = "matches";
var gCorsCspOverrideAll = "[all]";
var gCorsCspOverrideAllAllow = "[all-allow]";
var gCorsCspOverridePrefBase = gCorsCspType
    + gCorsCspOverridePrefSeparator + gCorsCspOverridePrefSuffix;
var gCorsOverridePrefBase = gCorsType
    + gCorsCspOverridePrefSeparator + gCorsCspOverridePrefSuffix;
var gCspOverridePrefBase = gCspType
    + gCorsCspOverridePrefSeparator + gCorsCspOverridePrefSuffix;
var gCorsCspOverrideDumpPrefix = "corsCspOverride";


// \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ //

function _corsCspTestUrl(aUrl) {
  var _internalSeparator = "_";

  var values = {};
  var valueDefault = "[\"\"]";

  values[gCorsCspOverrideExcludes] = valueDefault;
  values[gCorsCspOverrideIncludes] = valueDefault;
  values[gCorsCspOverrideMatches] = valueDefault;

  var _pref = "";
  Object.getOwnPropertyNames(values).forEach(function (prop) {
    _pref = gCorsCspOverridePrefBase
        + gCorsCspOverridePrefItemsSeparator + prop;
    if (GM_prefRoot.exists(_pref) && GM_prefRoot.getValue(_pref)) {
      _pref = gCorsCspOverridePrefBase
          + gCorsCspOverridePrefItemsSeparator + prop
          + gCorsCspOverridePrefItemsSeparator + gCorsCspOverridePrefItemsValue;
      if (GM_prefRoot.exists(_pref)) {
        values[prop] = GM_prefRoot.getValue(_pref);
      }
    }
  });

  var _error = false;
  Object.getOwnPropertyNames(values).forEach(function (prop) {
    try {
      values[_internalSeparator + prop] = JSON.parse(values[prop]);
    } catch (e) {
      dump(gCorsCspOverrideDumpPrefix + " - testUrl (" + aUrl + ") - "
          + prop + ": " + values[prop]
          + " - e:" + "\n" + e + "\n");
      _error = true;
      return false;
    }
    if (!Array.isArray(values[_internalSeparator + prop])) {
      dump(gCorsCspOverrideDumpPrefix + " - testUrl (" + aUrl + ") - "
          + prop + ": " + values[prop]
          + " - isArray: false");
      _error = true;
      return false;
    }
    values[prop + _internalSeparator] = false;
  });
  if (_error) {
    return false;
  }

  var uri = GM_util.uriFromUrl(aUrl);

  function testClude(glob) {
    return GM_convert2RegExp(glob, uri).test(aUrl);
  }

  function testMatch(matchPattern) {
    if (typeof matchPattern == "string") {
      try {
        matchPattern = new MatchPattern(matchPattern);
      } catch (e) {
        dump(gCorsCspOverrideDumpPrefix + " - testUrl (" + aUrl + "): "
            + gStringBundle.GetStringFromName("parse.ignoring-match")
            .replace("%1", matchPattern).replace("%2", e));
        return false;
      }
    }
    return matchPattern.doMatch(aUrl);
  }

  if (!GM_util.isGreasemonkeyable(aUrl)) {
    // dump(gCorsCspOverrideDumpPrefix + " - testUrl (" + aUrl + ") - isGreasemonkeyable: false" + "\n");
    return false;
  }

  values[gCorsCspOverrideExcludes + _internalSeparator] = (
      (values[_internalSeparator + gCorsCspOverrideExcludes]
          .join("").trim() != "")
      && values[_internalSeparator + gCorsCspOverrideExcludes]
          .some(testClude));
  // dump(gCorsCspOverrideDumpPrefix + " - testUrl (" + aUrl + ") - " + gCorsCspOverrideExcludes + ": " + values[gCorsCspOverrideExcludes] + " => " + values[gCorsCspOverrideExcludes + _internalSeparator].toString() + "\n");

  if (values[gCorsCspOverrideExcludes + _internalSeparator]) {
    return false;
  }

  values[gCorsCspOverrideIncludes + _internalSeparator] = (
      (values[_internalSeparator + gCorsCspOverrideIncludes]
          .join("").trim() != "")
      && values[_internalSeparator + gCorsCspOverrideIncludes]
          .some(testClude));
  // dump(gCorsCspOverrideDumpPrefix + " - testUrl (" + aUrl + ") - " + gCorsCspOverrideIncludes + ": " + values[gCorsCspOverrideIncludes] + " => " + values[gCorsCspOverrideIncludes + _internalSeparator].toString() + "\n");

  values[gCorsCspOverrideMatches + _internalSeparator] = (
      (values[_internalSeparator + gCorsCspOverrideMatches]
          .join("").trim() != "")
      && values[_internalSeparator + gCorsCspOverrideMatches]
          .some(testMatch));
  // dump(gCorsCspOverrideDumpPrefix + " - testUrl (" + aUrl + ") - " + gCorsCspOverrideMatches + ": " + values[gCorsCspOverrideMatches] + " => " + values[gCorsCspOverrideMatches + _internalSeparator].toString() + "\n");

  var _return = values[gCorsCspOverrideIncludes + _internalSeparator]
      || values[gCorsCspOverrideMatches + _internalSeparator];
  return _return;
}

function _corsCspRulesOverride(aRules, aHeader) {
  switch (aHeader.type) {
    case gCorsType:
      aRules = _corsOverride(aRules, aHeader);
      break;
    case gCspType:  
      aRules = _cspOverride(aRules);
      break;
  }
  return aRules;
}

function _corsCspRulesEmpty(aObj) {
  return aObj.value !== "";
}

function corsCspOverride(aSubject, aTopic, aData) {
  var aDetailsIn = aSubject;
  var aDetailsOut = {};

  var addonType = 0;
  if ((aDetailsIn != null)
      && (typeof aDetailsIn === "object")
      && aDetailsIn.hasOwnProperty("responseHeaders")) {
    addonType = 1;
    aTopic = gCorsCspListener.value;
  }

  if (!GM_util.getEnabled()) {
    return (addonType == 0) ? null : aDetailsIn.responseHeaders;
  }

  var corsOverride = GM_prefRoot.getValue(gCorsOverridePrefBase);
  var cspOverride = GM_prefRoot.getValue(gCspOverridePrefBase);

  if (!corsOverride && !cspOverride) {
    return (addonType == 0) ? null : aDetailsIn.responseHeaders;
  }

  var _info = {
    "status": 0,
    "url": "",
  };

  if (addonType == 0) {
    var _observer = {
      "allow": false,
      "unknown": true,
    };
    for (var observer in gCorsCspObservers) {
      if (gCorsCspObservers[observer].value == aTopic) {
        _observer.allow = gCorsCspObservers[observer].allow;
        _observer.unknown = false;
        break;
      }
    }
    if (!_observer.allow) {
      dump(gCorsCspOverrideDumpPrefix + " - forbidden topic: " + aTopic + "\n");
      return null;
    }
    if (_observer.unknown) {
      dump(gCorsCspOverrideDumpPrefix + " - unknown topic: " + aTopic + "\n");
      return null;
    }

    var channel = aSubject.QueryInterface(Ci.nsIChannel);
    if (!channel) {
      return null;
    }

    _info.url = channel.URI.spec;
  } else {
    _info.url = aDetailsIn.url;
  }
  // dump(gCorsCspOverrideDumpPrefix + " - topic (" + aTopic + ") - url: " + _info.url + "\n");

  if (addonType == 0) {
    try {
      var httpChannel = channel.QueryInterface(Ci.nsIHttpChannel);
      _info.status = httpChannel.responseStatus;
    } catch (e) {
      // dump(gCorsCspOverrideDumpPrefix + " - http - file:///? - e:" + "\n" + e + "\n");
      return null;
    }
  } else {
    _info.status = aDetailsIn.statusCode;
  }
  // dump(gCorsCspOverrideDumpPrefix + " - http - status: " + _info.status + "\n");

  if (_info.status != 200) {
    return (addonType == 0) ? null : aDetailsIn.responseHeaders;
  }

  if (!_corsCspTestUrl(_info.url)) {
    // dump(gCorsCspOverrideDumpPrefix + " - testUrl (" + aUrl + "): false" + "\n");
    return (addonType == 0) ? null : aDetailsIn.responseHeaders;
  }

  var corsHeaders = [
    {
      "rewrite": 0,
      "type": gCorsType,
      "value": "access-control-allow-headers",
    },
    {
      "rewrite": 0,
      "type": gCorsType,
      "value": "access-control-allow-methods",
    },
    {
      "rewrite": 0,
      "type": gCorsType,
      "value": "access-control-allow-origin",
    },
    {
      "rewrite": 0,
      "type": gCorsType,
      "value": "access-control-expose-headers",
    },
    {
      "rewrite": 2,
      "type": gCorsType,
      "value": "x-content-type-options",
    },
    {
      "rewrite": 1,
      "type": gCorsType,
      "value": "x-frame-options",
    },
  ];

  var cspHeaders = [
    {
      "type": gCspType,
      "value": "content-security-policy",
    },
    {
      "type": gCspType,
      "value": "x-content-security-policy",
    },
  ];

  var corsCspRules = null;
  var corsCspRulesMy = null;
  var _corsCspOverride = false;

  var corsCspHeaders = corsHeaders.concat(cspHeaders);

  if (addonType != 0) {
    // dump(gCorsCspOverrideDumpPrefix + " - headers - details: " + JSON.stringify(aDetailsIn) + "\n");
    var inHeaders = aDetailsIn.responseHeaders;
    var corsCspRulesIn = {
      "index": [],
      "value": [],
    };
    var corsCspRulesOut = {
      "index": [],
      "value": [],
    };
    // dump(gCorsCspOverrideDumpPrefix + " - headers - details - responseHeaders - before: " + JSON.stringify(inHeaders) + "\n");
  }

  for (var i = 0, i_count = corsCspHeaders.length; i < i_count; i++) {
    if ((corsOverride && (corsCspHeaders[i].type == gCorsType))
        || (cspOverride && (corsCspHeaders[i].type == gCspType))) {
      try {    
        if (addonType == 0) {
          corsCspRules = channel.getResponseHeader(corsCspHeaders[i].value);
        } else {
          corsCspRulesIn = {
            "index": [],
            "value": [],
          };
          for (var j = 0, j_count = inHeaders.length;
              j < j_count; j++) {
            if (inHeaders[j].name.toLowerCase()
                == corsCspHeaders[i].value) {
              corsCspRulesIn.index.push(j);
              corsCspRulesIn.value.push(inHeaders[j].value);
              // break;
            }
          }
          if (corsCspRulesIn.index.length == 0) {
            throw gCorsCspMessages.notDefined.value;
          }
          corsCspRules = JSON.stringify(corsCspRulesIn);
        }
        // dump(gCorsCspOverrideDumpPrefix + " - header (" + corsCspHeaders[i].type + " / " + corsCspHeaders[i].value + ") - before: " + corsCspRules + "\n");
        _corsCspOverride = false;
        if (corsOverride && (corsCspHeaders[i].type == gCorsType)) {
          _corsCspOverride = true;
        }
        if (cspOverride && (corsCspHeaders[i].type == gCspType)) {
          _corsCspOverride = true;
        }
        if (addonType == 0) {
          if (_corsCspOverride) {
            corsCspRulesMy = _corsCspRulesOverride(
                corsCspRules, corsCspHeaders[i]);
            channel.setResponseHeader(
                corsCspHeaders[i].value, corsCspRulesMy, false);
          }
        } else {
          for (var j = 0, j_count = corsCspRulesIn.index.length;
              j < j_count; j++) {
            if (_corsCspOverride) {
              corsCspRulesMy = _corsCspRulesOverride(
                  corsCspRulesIn.value[j], corsCspHeaders[i]);
              inHeaders[corsCspRulesIn.index[j]].value
                  = corsCspRulesMy;
            }
          }
        }
        try {
          if (addonType == 0) {
            corsCspRules = channel.getResponseHeader(corsCspHeaders[i].value);
          } else {
            corsCspRulesOut = {
              "index": [],
              "value": [],
            };
            for (var j = 0, j_count = corsCspRulesIn.index.length;
                j < j_count; j++) {
              if (corsCspRulesIn.value[j].toLowerCase()
                  == corsCspHeaders[i].value) {
                corsCspRulesOut.index.push(j);
                corsCspRulesOut.value.push(corsCspRulesIn.value[j]);
                // break;
              }
            }
            if ((corsCspRulesOut.index.length == 0)
                || (corsCspRulesOut.value.filter(_corsCspRulesEmpty)
                  .length == 0)) {
              throw gCorsCspMessages.notDefined.value;
            }
            corsCspRules = JSON.stringify(corsCspRulesOut);
          }
        } catch (e) {
          // dump(gCorsCspOverrideDumpPrefix + " - header (" + corsCspHeaders[i].type + " / " + corsCspHeaders[i].value + ") - after - " + gCorsCspMessages.notDefined.content + "? - e:" + "\n" + e + "\n");
          continue;
        }
        // dump(gCorsCspOverrideDumpPrefix + " - header (" + corsCspHeaders[i].type + " / " + corsCspHeaders[i].value + ") - after: " + corsCspRules + "\n");
      } catch (e) {
        // dump(gCorsCspOverrideDumpPrefix + " - header (" + corsCspHeaders[i].type + " / " + corsCspHeaders[i].value + ") - " + gCorsCspMessages.notDefined.content + "? - e:" + "\n" + e + "\n");
        continue;
      }
    }
  }

  if (addonType != 0) {
    aDetailsOut.responseHeaders = inHeaders.filter(_corsCspRulesEmpty);
    // dump(gCorsCspOverrideDumpPrefix + " - headers - details - responseHeaders - after: " + JSON.stringify(aDetailsOut.responseHeaders) + "\n");
    return aDetailsOut;
  }
}

function _corsOverride(aCorsRules, aCorsHeader) {
  var rules = aCorsRules.trim();

  var rulesMyDefault = {
    "override": GM_prefRoot.getValue(
        gCorsOverridePrefBase
        + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAll),
    "value": [
      "*",
      "ALLOW-FROM *",
      "",
    ],
  };

  // JSON.clone = JSON.parse(JSON.stringify(...))
  var rulesMy = {
    "value": JSON.parse(JSON.stringify(rulesMyDefault)),
  };

  // dump(gCorsCspOverrideDumpPrefix + " - cors - rules - my (" + aCorsHeader.value + ") - preset - before: " + JSON.stringify(rulesMy) + "\n");
  var _pref = "";
  if (rulesMyDefault.override) {
    rulesMy.value.override = true;
  } else {
    _pref = gCorsOverridePrefBase
        + gCorsCspOverridePrefItemsSeparator + aCorsHeader.value;
    if (GM_prefRoot.exists(_pref)) {
      rulesMy.value.override = GM_prefRoot.getValue(_pref);
    }
  }
  // dump(gCorsCspOverrideDumpPrefix + " - cors - rules - my (" + aCorsHeader.value + ") - preset - after: " + JSON.stringify(rulesMy) + "\n");

  // dump(gCorsCspOverrideDumpPrefix + " - cors - rules - my (" + aCorsHeader.value + ") - before: " + rules + "\n");
  if (rulesMy.value.override
      && (rules != rulesMy.value.value[aCorsHeader.rewrite])) {
    // dump(gCorsCspOverrideDumpPrefix + " - cors - rules - my (" + aCorsHeader.value + ") - rewrite: " + rulesMy.value.value[aCorsHeader.rewrite] + "\n");
    rules = rulesMy.value.value[aCorsHeader.rewrite];
  }
  // dump(gCorsCspOverrideDumpPrefix + " - cors - rules - my (" + aCorsHeader.value + ") - after: " + rules + "\n");

  return rules;
}

function _cspOverride(aCspRules) {
  var rulesSeparator = ";";
  var rulesValuesSeparator = " ";

  var rules = aCspRules.split(rulesSeparator);

  var cspOverrideSourceList = "[source-list]";
  var cspOverrideSourceListValue = cspOverrideSourceList
      + gCorsCspOverridePrefItemsSeparator + gCorsCspOverridePrefItemsValue;

  var rulesSpec = [
    {
      "name": "default-src",
      "value": {
        "name": "strict-dynamic",
        "value": "'strict-dynamic'",
      },
    },
    {
      "name": "sandbox",
      "value": {
        "name": "allow-forms",
        "value": "allow-forms",
      },
    },
    {
      "name": "sandbox",
      "value": {
        "name": "allow-pointer-lock",
        "value": "allow-pointer-lock",
      },
    },
    {
      "name": "sandbox",
      "value": {
        "name": "allow-popups",
        "value": "allow-popups",
      },
    },
    {
      "name": "sandbox",
      "value": {
        "name": "allow-same-origin",
        "value": "allow-same-origin",
      },
    },
    {
      "name": "sandbox",
      "value": {
          "name": "allow-scripts",
          "value": "allow-scripts",
      },
    },
    {
      "name": "sandbox",
      "value": {
        "name": "allow-top-navigation",
        "value": "allow-top-navigation",
      },
     },
    {
      "name": "script-src",
      "value": {
        "name": "strict-dynamic",
        "value": "'strict-dynamic'",
      },
    },
  ];

  var rulesMySpec = [
    {
      "delete": {
        "hash": true,
        "nonce": false,
      },
      "name": "unsafe-eval",
      "value": "'unsafe-eval'",
    },
    {
      "delete": {
        "hash": true,
        "nonce": true,
      },
      "name": "unsafe-inline",
      "value": "'unsafe-inline'",
    },
  ];

  // "*" - see http://bugzil.la/1086999

  var rulesMyDefault = [
    {
      "name": gCorsCspOverrideAllAllow,
      "override": GM_prefRoot.getValue(
          gCspOverridePrefBase
          + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAll
          + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAllAllow),
      "value": "* blob: data: 'unsafe-eval' 'unsafe-inline'",
    },
    {
      "name": cspOverrideSourceList,
      "override": GM_prefRoot.getValue(
          gCspOverridePrefBase
          + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAll
          + gCorsCspOverridePrefItemsSeparator + cspOverrideSourceList),
      "value": GM_prefRoot.getValue(
          gCspOverridePrefBase
          + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAll
          + gCorsCspOverridePrefItemsSeparator + cspOverrideSourceListValue),
    },
  ];
  for (var item in rulesMySpec) {
    rulesMyDefault.push(
      {
        "name": rulesMySpec[item].name,
        "override": GM_prefRoot.getValue(
            gCspOverridePrefBase
            + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAll
            + gCorsCspOverridePrefItemsSeparator + rulesMySpec[item].name),
        "value": rulesMySpec[item].value,
      }
    );
  }

  // base-uri, block-all-mixed-content, child-src, connect-src,
  // font-src, form-action, frame-ancestors, frame-src, img-src,
  // manifest-src, media-src, object-src, plugin-types,
  // referrer, reflected-xss, report-uri, require-sri-for,
  // sandbox, script-src, strict-dynamic, style-src, upgrade-insecure-requests,
  // worker-src
  // JSON.clone = JSON.parse(JSON.stringify(...))
  var rulesMy = [
    {
      "name": "base-uri",
      "value": JSON.parse(JSON.stringify(rulesMyDefault)),
    },
    {
      "name": "block-all-mixed-content",
      "value": [
        {
          "name": gCorsCspOverrideAllAllow,
          "override": GM_prefRoot.getValue(
              gCspOverridePrefBase
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAll
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAllAllow),
          "value": "",
        },
      ],
    },
    {
      "name": "child-src",
      "value": JSON.parse(JSON.stringify(rulesMyDefault)),
    },
    {
      "name": "connect-src",
      "value": JSON.parse(JSON.stringify(rulesMyDefault)),
    },
    {
      "name": "default-src",
      "value": JSON.parse(JSON.stringify(rulesMyDefault)),
    },
    {
      "name": "font-src",
      "value": JSON.parse(JSON.stringify(rulesMyDefault)),
    },
    {
      "name": "form-action",
      "value": JSON.parse(JSON.stringify(rulesMyDefault)),
    },
    {
      "name": "frame-ancestors",
      "value": JSON.parse(JSON.stringify(rulesMyDefault)),
    },
    {
      "name": "frame-src",
      "value": JSON.parse(JSON.stringify(rulesMyDefault)),
    },
    {
      "name": "img-src",
      "value": JSON.parse(JSON.stringify(rulesMyDefault)),
    },
    {
      "name": "manifest-src",
      "value": JSON.parse(JSON.stringify(rulesMyDefault)),
    },
    {
      "name": "media-src",
      "value": JSON.parse(JSON.stringify(rulesMyDefault)),
    },
    {
      "name": "object-src",
      "value": JSON.parse(JSON.stringify(rulesMyDefault)),
    },
    {
      "name": "plugin-types",
      "value": [
        {
          "name": gCorsCspOverrideAllAllow,
          "override": GM_prefRoot.getValue(
              gCspOverridePrefBase
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAll
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAllAllow),
          "value": "*",
        },
      ],
    },
    {
      "name": "refferer",
      "value": [
        {
          "name": gCorsCspOverrideAllAllow,
          "override": GM_prefRoot.getValue(
              gCspOverridePrefBase
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAll
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAllAllow),
          "value": "'unsafe-url'",
        },
      ],
    },
    {
      "name": "reflected-xss",
      "value": [
        {
          "name": gCorsCspOverrideAllAllow,
          "override": GM_prefRoot.getValue(
              gCspOverridePrefBase
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAll
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAllAllow),
          "value": "allow",
        },
      ],
    },
    {
      "name": "report-uri",
      "value": [
        {
          "name": gCorsCspOverrideAllAllow,
          "override": GM_prefRoot.getValue(
              gCspOverridePrefBase
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAll
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAllAllow),
          "value": "",
        },
      ],
    },
    {
      "name": "require-sri-for",
      "value": [
        {
          "name": gCorsCspOverrideAllAllow,
          "override": GM_prefRoot.getValue(
              gCspOverridePrefBase
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAll
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAllAllow),
          "value": "",
        },
      ],
    },
    {
      "name": "sandbox",
      "value": [
        {
          "name": gCorsCspOverrideAllAllow,
          "override": GM_prefRoot.getValue(
              gCspOverridePrefBase
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAll
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAllAllow),
          "value": "",
        },
      ],
    },
    {
      "name": "script-src",
      "value": JSON.parse(JSON.stringify(rulesMyDefault)),
    },
    {
      "name": "style-src",
      "value": JSON.parse(JSON.stringify(rulesMyDefault)),
    },
    {
      "name": "upgrade-insecure-requests",
      "value": [
        {
          "name": gCorsCspOverrideAllAllow,
          "override": GM_prefRoot.getValue(
              gCspOverridePrefBase
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAll
              + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAllAllow),
          "value": "",
        },
      ],
    },
    {
      "name": "worker-src",
      "value": JSON.parse(JSON.stringify(rulesMyDefault)),
    },
  ];
  for (var i = 0, i_count = rulesSpec.length; i < i_count; i++) {
    for (var j = 0, j_count = rulesMy.length; j < j_count; j++) {
      if (rulesSpec[i].name == rulesMy[j].name) {
        rulesMy[j].value.push(
          {
            "name": rulesSpec[i].value.name,
            "override": GM_prefRoot.getValue(
                gCspOverridePrefBase
                + gCorsCspOverridePrefItemsSeparator + gCorsCspOverrideAll
                + gCorsCspOverridePrefItemsSeparator + rulesSpec[i].value.name),
            "value": rulesSpec[i].value.value,
          }
        );
        break;
      }
    }
  }

  // dump(gCorsCspOverrideDumpPrefix + " - csp - rules - my - preset - before: " + JSON.stringify(rulesMy) + "\n");
  var _pref = "";
  for (var i = 0, i_count = rulesMy.length; i < i_count; i++) {
    labelCspOverride1:
    for (var j = 0, j_count = rulesMy[i].value.length; j < j_count; j++) {
      for (var k = 0, k_count = rulesMyDefault.length; k < k_count; k++) {
        if (rulesMyDefault[k].override
            && (rulesMyDefault[k].name == rulesMy[i].value[j].name)) {
          continue labelCspOverride1;
        }
      }
      _pref = gCspOverridePrefBase
          + gCorsCspOverridePrefItemsSeparator + rulesMy[i].name
          + gCorsCspOverridePrefItemsSeparator + rulesMy[i].value[j].name;
      if (GM_prefRoot.exists(_pref)) {
        rulesMy[i].value[j].override = GM_prefRoot.getValue(_pref);
        _pref = gCspOverridePrefBase
            + gCorsCspOverridePrefItemsSeparator + rulesMy[i].name
            + gCorsCspOverridePrefItemsSeparator + rulesMy[i].value[j].name
            + gCorsCspOverridePrefItemsSeparator
            + gCorsCspOverridePrefItemsValue;
        if (GM_prefRoot.exists(_pref)) {
          rulesMy[i].value[j].value = GM_prefRoot.getValue(_pref);
        }
      }
    }
  }
  // dump(gCorsCspOverrideDumpPrefix + " - csp - rules - my - preset - after: " + JSON.stringify(rulesMy) + "\n");

  // http://www.w3.org/TR/CSP2/#directive-script-src
  // http://www.w3.org/TR/CSP2/#source-list-syntax
  // http://bugzil.la/1004703, http://bugzil.la/1026520, etc.
  // - Content Security Policy: Ignoring “'unsafe-inline'”
  //   within script-src or style-src: nonce-source or hash-source specified
  // e.g.: https://twitter.com/
  var rulesDelete = {
    "flags": "gim",
    "prefix": "\\s?'",
    "suffix": "'",
  };
  var rulesDeleteHashRegex = {
    "override": true,
    "value": new RegExp(rulesDelete.prefix
        + "(sha256|sha384|sha512)-[^']+"
        + rulesDelete.suffix, rulesDelete.flags),
  };
  var rulesDeleteNonceRegex = {
    "override": true,
    "value": new RegExp(rulesDelete.prefix
        + "nonce-[^']+"
        + rulesDelete.suffix, rulesDelete.flags),
  };
  var rulesDeleteNoneRegex = {
    "override": true,
    "value": new RegExp(rulesDelete.prefix
        + "none"
        + rulesDelete.suffix, rulesDelete.flags),
  };

  // - Content Security Policy: Duplicate ... directives detected.
  //   All but the first instance will be ignored.
  // But... All directives. We will not count on it...
  var ruleName = "";
  var ruleValue = "";
  var ruleValues = [];
  var ruleRewriteHash = false;
  var ruleRewriteNonce = false;
  var ruleRewriteNone = false;
  var ruleRewriteValue = "";
  var ruleSourceListValue = "";
  var ruleSourceListValues = [];
  var ruleSourceListRewriteValue = "";
    for (var i = 0, i_count = rules.length; i < i_count; i++) {
    if (rules[i].trim() != "") {
      // dump(gCorsCspOverrideDumpPrefix + " - csp - rules: " + rules[i].trim() + "\n");
      for (var j = 0, j_count = rulesMy.length; j < j_count; j++) {
        if (rules[i].toLowerCase().trim().indexOf(rulesMy[j].name) == 0) {
          // dump(gCorsCspOverrideDumpPrefix + " - csp - rules - my (" + rulesMy[j].name + ") - before: " + rules[i] + "\n");
          ruleRewriteHash = false;
          ruleRewriteNonce = false;
          ruleRewriteNone = false;
          ruleName = rules[i].substring(
              0, rules[i].toLowerCase().indexOf(rulesMy[j].name)
              + rulesMy[j].name.length);
          ruleValue = rules[i].slice(rules[i].toLowerCase()
              .indexOf(rulesMy[j].name) + rulesMy[j].name.length);
          for (var k = 0, k_count = rulesMy[j].value.length; k < k_count; k++) {
            if (rulesMy[j].value[k].override) {
              if (rulesMy[j].value[k].name == gCorsCspOverrideAllAllow) {
                // dump(gCorsCspOverrideDumpPrefix + " - csp - rules - my (" + rulesMy[j].name + ") - rewrite (" + rulesMy[j].value[k].name + "): " + rulesMy[j].value[k].value + "\n");
                ruleValue = rulesMy[j].value[k].value;
                ruleValues = ruleValue.split(rulesValuesSeparator);
              } else {
                ruleValues = ruleValue.split(rulesValuesSeparator);
                if (rulesMy[j].value[k].name == cspOverrideSourceList) {
                  ruleRewriteNone = true;
                  ruleRewriteValue = "";
                  ruleSourceListValue = rulesMy[j].value[k].value;
                  ruleSourceListValues = ruleSourceListValue.split(
                      rulesValuesSeparator);
                  for (var l = 0, l_count = ruleSourceListValues.length;
                      l < l_count; l++) {
                    ruleSourceListRewriteValue = ruleSourceListValues[l];
                    for (var m = 0, m_count = ruleValues.length;
                        m < m_count; m++) {
                      if (ruleValues[m].toLowerCase().trim()
                          == ruleSourceListValues[l]) {
                        // dump(gCorsCspOverrideDumpPrefix + " - csp - rules - my (" + rulesMy[j].name + ") - rewrite (" + rulesMy[j].value[k].name + ") - they are identical: " + ruleValues[m].toLowerCase().trim() + " / " + ruleSourceListValues[l] + "\n");
                        ruleSourceListRewriteValue = "";
                        break;
                      }
                    }
                    ruleRewriteValue = (ruleRewriteValue + rulesValuesSeparator
                        + ruleSourceListRewriteValue).trim();
                  }
                } else {
                  for (var l = 0, l_count = rulesMySpec.length;
                      l < l_count; l++) {
                    if (rulesMySpec[l].value == rulesMy[j].value[k].value) {
                      if (rulesMySpec[l].delete.hash) {
                        ruleRewriteHash = true;
                      }
                      if (rulesMySpec[l].delete.nonce) {
                        ruleRewriteNonce = true;
                      }
                      break;
                    }
                  }
                  ruleRewriteNone = true;
                  ruleRewriteValue = rulesMy[j].value[k].value;
                  for (var l = 0, l_count = ruleValues.length;
                      l < l_count; l++) {
                    if (ruleValues[l].toLowerCase().trim()
                        == rulesMy[j].value[k].value) {
                      // dump(gCorsCspOverrideDumpPrefix + " - csp - rules - my (" + rulesMy[j].name + ") - rewrite (" + rulesMy[j].value[k].name + ") - they are identical: " + ruleValues[l].toLowerCase().trim() + " / " + rulesMy[j].value[k].value + "\n");
                      ruleRewriteValue = "";
                      break;
                    }
                  }
                }
                // dump(gCorsCspOverrideDumpPrefix + " - csp - rules - my (" + rulesMy[j].name + ") - rewrite (" + rulesMy[j].value[k].name + "): " + ruleRewriteValue + "\n");
                ruleValue = (ruleValue + rulesValuesSeparator
                    + ruleRewriteValue).trim();
                ruleValues = ruleValue.split(rulesValuesSeparator);
              }
              // the empty string => delete this rule
              rules[i] = (
                  (ruleValues.join(rulesValuesSeparator).trim() != "")
                  ? ruleName + rulesValuesSeparator
                    + ruleValues.join(rulesValuesSeparator).trim()
                  : "");
            }
          }
          if (ruleRewriteHash) {
            if (rulesDeleteHashRegex.override
                && rulesDeleteHashRegex.value.test(rules[i])) {
              // dump(gCorsCspOverrideDumpPrefix + " - csp - rules - my (" + rulesMy[j].name + ") - delete (hash)" + "\n");
              rules[i] = rules[i].replace(rulesDeleteHashRegex.value, "");
            }
          }
          if (ruleRewriteNonce) {
            if (rulesDeleteNonceRegex.override
                && rulesDeleteNonceRegex.value.test(rules[i])) {
              // dump(gCorsCspOverrideDumpPrefix + " - csp - rules - my (" + rulesMy[j].name + ") - delete (nonce)" + "\n");
              rules[i] = rules[i].replace(rulesDeleteNonceRegex.value, "");
            }
          }
          if (ruleRewriteNone) {
            if (rulesDeleteNoneRegex.override
                && rulesDeleteNoneRegex.value.test(rules[i])) {
              // dump(gCorsCspOverrideDumpPrefix + " - csp - rules - my (" + rulesMy[j].name + ") - delete (none)" + "\n");
              rules[i] = rules[i].replace(rulesDeleteNoneRegex.value, "");
            }
          }
          // dump(gCorsCspOverrideDumpPrefix + " - csp - rules - my (" + rulesMy[j].name + ") - after: " + rules[i] + "\n");
          break;
        }
      }
    }
  }

  // remove empty strings => array.filter(Boolean)
  return rules.filter(Boolean).join(rulesSeparator).trim();
}

// \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ // \\ //

try {
  for (var observer in gCorsCspObservers) {
    Services.obs.addObserver({
      "observe": function (aSubject, aTopic, aData) {
        try {
          corsCspOverride(aSubject, aTopic, aData);
        } catch (e) {
          dump(gCorsCspName + " observer failed:" + "\n" + e + "\n");
        }
      }
    }, gCorsCspObservers[observer].value, false);
  }
} catch (e) {
  try {
    chrome.webRequest[gCorsCspListener.value].addListener(
      corsCspOverride,
      {"urls": ["<all_urls>"]},
      ["responseHeaders", "blocking"]
    );
  } catch (e) {
    dump(gCorsCspName + " listener failed:" + "\n" + e + "\n");
  }
}
