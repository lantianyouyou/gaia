'use strict';

var Actions = require('marionette-client').Actions;
var System = require('../../../system/test/marionette/lib/system');
var StatusBar = require('./lib/statusbar');

marionette('Statusbar Visibility', function() {
  var client = marionette.client({
    prefs: {
      'dom.w3c_touch_events.enabled': 1
    },
    settings: {
      'ftu.manifestURL': null,
      'lockscreen.enabled': false,
      'nfc.enabled': true
    }
  });

  var actions = new Actions(client);
  var system = new System(client);
  var statusBar = new StatusBar(client);
  var halfScreenHeight;

  setup(function() {
    system.waitForStartup();
    halfScreenHeight = client.executeScript(function() {
      return window.innerHeight;
    }) / 2;
  });

  test('Visibility of date in utility tray', function() {
    actions
      .press(system.topPanel)
      .moveByOffset(0, halfScreenHeight)
      .release()
      .perform();
    client.waitFor(function() {
      // The element is rendered with moz-element so we can't use
      // marionette's .displayed()
      var visibility = system.statusbarLabel.scriptWith(function(element) {
        return window.getComputedStyle(element).visibility;
      });
      return (visibility == 'visible');
    });
  });

  // skipping since nfc.enabled triggers HW change and icon is updated
  // on succeess. Status bar needs to observe nfc.status setting.
  // This will be fixed and reenabled in Bug XXXXX
  test.skip('NFC icon is visible', function() {
    statusBar.nfc.waitForIconToAppear();
  });
});
