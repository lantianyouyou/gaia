'use strict';

mocha.globals(['NfcManager', 'ScreenManager', 'SettingsListener',
      'lockScreen']);

/* globals MockNfc, MocksHelper,
           MozNDEFRecord, NfcBuffer, NDEF, NfcUtils, NfcManagerUtils,
           NfcManager */

require('/shared/test/unit/mocks/mock_moz_ndefrecord.js');
require('/shared/test/unit/mocks/mock_settings_listener.js');
require('/shared/js/nfc_utils.js');
require('/test/unit/mock_screen_manager.js');
requireApp('system/test/unit/mock_activity.js');
requireApp('system/test/unit/mock_nfc.js');
requireApp('system/test/unit/mock_screen_manager.js');
requireApp('system/test/unit/mock_settingslistener_installer.js');
requireApp('system/js/nfc_manager_utils.js');
requireApp('system/test/unit/mock_lock_screen.js');

var mocksForNfcManager = new MocksHelper([
  'MozActivity',
  'MozNDEFRecord',
  'ScreenManager',
  'SettingsListener'
]).init();

var MockMessageHandlers = {};
function MockMozSetMessageHandler(event, handler) {
  MockMessageHandlers[event] = handler;
}

suite('Nfc Manager Functions', function() {

  var realMozSetMessageHandler;
  var realLockScreen;

  mocksForNfcManager.attachTestHelpers();

  setup(function(done) {
    realMozSetMessageHandler = window.navigator.mozSetMessageHandler;
    window.navigator.mozSetMessageHandler = MockMozSetMessageHandler;
    realLockScreen = window.lockScreen;
    window.lockScreen = window.MockLockScreen;
    
    requireApp('system/js/nfc_manager.js', done);
  });

  teardown(function() {
    window.navigator.mozSetMessageHandler = realMozSetMessageHandler;
    window.lockScreen = realLockScreen;
  });

  suite('init', function() {
    test('Message handleres for nfc-manager-tech-xxx set', function() {
      var stubHandleTechnologyDiscovered =
        this.sinon.stub(NfcManager, 'handleTechnologyDiscovered');
      var stubHandleTechLost = this.sinon.stub(NfcManager, 'handleTechLost');
      
      // calling init once more to register stubs as handlers
      NfcManager.init();
      
      MockMessageHandlers['nfc-manager-tech-discovered']();
      assert.isTrue(stubHandleTechnologyDiscovered.calledOnce);

      MockMessageHandlers['nfc-manager-tech-lost']();
      assert.isTrue(stubHandleTechLost.calledOnce);
    });

    test('NfcManager listens on screenchange, lock, unlock events', function() {
      var stubHandleEvent = this.sinon.stub(NfcManager, 'handleEvent');

      window.dispatchEvent(new CustomEvent('lock'));
      assert.isTrue(stubHandleEvent.calledOnce);
      assert.equal(stubHandleEvent.getCall(0).args[0].type, 'lock');

      window.dispatchEvent(new CustomEvent('unlock'));
      assert.isTrue(stubHandleEvent.calledTwice);
      assert.equal(stubHandleEvent.getCall(1).args[0].type, 'unlock');

      window.dispatchEvent(new CustomEvent('screenchange'));
      assert.isTrue(stubHandleEvent.calledThrice);
      assert.equal(stubHandleEvent.getCall(2).args[0].type, 'screenchange');
    });

    test('SettingsListner callback nfc.enabled fired', function() {
      var stubChangeHardwareState = this.sinon.stub(NfcManager,
                                               'changeHardwareState');

      window.MockSettingsListener.mCallbacks['nfc.enabled'](true);
      assert.isTrue(stubChangeHardwareState.calledOnce);
      assert.equal(stubChangeHardwareState.getCall(0).args[0],
                   NfcManager.NFC_HW_STATE_ON);

      window.MockSettingsListener.mCallbacks['nfc.enabled'](false);
      assert.isTrue(stubChangeHardwareState.calledTwice);
      assert.equal(stubChangeHardwareState.getCall(1).args[0],
                   NfcManager.NFC_HW_STATE_OFF);

      window.MockLockScreen.lock();
      window.MockSettingsListener.mCallbacks['nfc.enabled'](true);
      assert.isTrue(stubChangeHardwareState.calledThrice);
      assert.equal(stubChangeHardwareState.getCall(2).args[0],
                   NfcManager.NFC_HW_STATE_DISABLE_DISCOVERY);
      window.MockLockScreen.unlock();
    });
  });

  suite('handleEvent', function() {
    test('proper handling of lock, unlock, screenchange', function() {
      var stubChangeHardwareState = this.sinon.stub(NfcManager,
                                                   'changeHardwareState');

      // screen lock when NFC ON
      NfcManager.hwState = NfcManager.NFC_HW_STATE_ON;
      window.MockLockScreen.lock();
      NfcManager.handleEvent(new CustomEvent('lock'));
      assert.isTrue(stubChangeHardwareState.calledOnce);
      assert.equal(stubChangeHardwareState.getCall(0).args[0],
                   NfcManager.NFC_HW_STATE_DISABLE_DISCOVERY);
      
      // no change in NfcManager.hwState
      NfcManager.hwState = NfcManager.NFC_HW_STATE_DISABLE_DISCOVERY;
      NfcManager.handleEvent(new CustomEvent('screenchange'));
      assert.isTrue(stubChangeHardwareState.calledOnce);

      // screen unlock
      window.MockLockScreen.unlock();
      NfcManager.handleEvent(new CustomEvent('unlock'));
      assert.isTrue(stubChangeHardwareState.calledTwice);
      assert.equal(stubChangeHardwareState.getCall(1).args[0],
                   NfcManager.NFC_HW_STATE_ENABLE_DISCOVERY);
      
      // NFC off
      NfcManager.hwState = NfcManager.NFC_HW_STATE_OFF;
      NfcManager.handleEvent(new CustomEvent('lock'));
      NfcManager.handleEvent(new CustomEvent('unlock'));
      NfcManager.handleEvent(new CustomEvent('screenchange'));
      assert.isTrue(stubChangeHardwareState.calledTwice);
    });

    test('proper handling of shrinking-sent', function() {
      var stubRemoveEventListner = this.sinon.stub(window,
                                                   'removeEventListener');
      var stubDispatchEvent = this.sinon.stub(window, 'dispatchEvent');

      NfcManager.handleEvent(new CustomEvent('shrinking-sent'));
      
      assert.isTrue(stubRemoveEventListner.calledOnce);
      assert.equal(stubRemoveEventListner.getCall(0).args[0], 'shrinking-sent');
      assert.equal(stubRemoveEventListner.getCall(0).args[1], NfcManager);

      assert.isTrue(stubDispatchEvent.calledTwice);
      assert.equal(stubDispatchEvent.getCall(0).args[0].type,
                   'dispatch-p2p-user-response-on-active-app');
      assert.equal(stubDispatchEvent.getCall(0).args[0].detail, NfcManager);
      assert.equal(stubDispatchEvent.getCall(1).args[0].type, 'shrinking-stop');
    });
  });

  suite('handleNdefMessage and formatXXX methods', function() {
    
    var commonTestsHelper = function(message, methodName, type) {
      var spy = this.sinon.spy(NfcManager, methodName);

      var activityOptions = NfcManager.handleNdefMessage(message);
      assert.isTrue(spy.calledOnce, methodName + ' not called once');
      assert.equal(activityOptions.name, 'nfc-ndef-discovered');
      assert.equal(activityOptions.data.type, type);
      assert.equal(activityOptions.data.records, message);

      return activityOptions;
    };

    test('TNF empty', function() {
      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_EMPTY, null, null, null)];
      commonTestsHelper.call(this, dummyNdefMsg, 'formatEmpty', 'empty');
    });

    test('TNF well known rtd text utf 8', function() {
      var payload = Uint8Array([2, 101, 110, 72,
                                101, 121, 33, 32,
                                85, 84, 70, 45,
                                56, 32, 101, 110]);
      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_WELL_KNOWN,
                                            NDEF.RTD_TEXT,
                                            new Uint8Array(),
                                            payload)];
      var spyFormatTextRecord = this.sinon.spy(NfcManager, 'formatTextRecord');
      
      var activityOptions = commonTestsHelper.call(this,
                                                   dummyNdefMsg,
                                                   'formatWellKnownRecord',
                                                   'text');
                                        
      assert.isTrue(spyFormatTextRecord.calledOnce);
      assert.equal(activityOptions.data.text, 'Hey! UTF-8 en');
      assert.equal(activityOptions.data.rtd, NDEF.RTD_TEXT);
      assert.equal(activityOptions.data.language, 'en');
      assert.equal(activityOptions.data.encoding, 'UTF-8');
    });

    test('TNF well known rtd uri', function() {
      var payload1 = new Uint8Array([4, 119, 105, 107,
                                        105, 46, 109, 111,
                                        122, 105, 108, 108,
                                        97, 46, 111, 114,
                                        103, 47, 87, 101,
                                        98, 65, 80, 73,
                                        47, 87, 101, 98,
                                        78, 70, 67]);
      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_WELL_KNOWN,
                                            NDEF.RTD_URI,
                                            new Uint8Array(),
                                            payload1)];

      var spyFormatURIRecord = this.sinon.spy(NfcManager, 'formatURIRecord');
      
      var activityOptions = commonTestsHelper.call(this,
                                                  dummyNdefMsg,
                                                  'formatWellKnownRecord',
                                                  'url');
      assert.isTrue(spyFormatURIRecord.calledOnce);
      assert.equal(activityOptions.data.url,
                   'https://wiki.mozilla.org/WebAPI/WebNFC');
    });

    test('TNF well known smart poster', function() {
      // smart poster handling is application specific, don't need payload
      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_WELL_KNOWN,
                                            NDEF.RTD_SMART_POSTER,
                                            new Uint8Array(),
                                            new Uint8Array())];

      var spyFormatSPRecord = this.sinon.spy(NfcManager,
                                             'formatSmartPosterRecord');

      commonTestsHelper.call(this, dummyNdefMsg,
                             'formatWellKnownRecord', 'smartposter');
      assert.isTrue(spyFormatSPRecord.calledOnce);
    });

  });


  suite('NFC Utils', function() {

    var string1;
    var uint8array1;

    setup(function() {
      string1 = 'StringTestString ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      uint8array1 = new Uint8Array([0x53, 0x74, 0x72, 0x69, 0x6e, 0x67,
                                    0x54, 0x65, 0x73, 0x74,
                                    0x53, 0x74, 0x72, 0x69, 0x6e, 0x67,
                                    0x20,
                                    0x41, 0x42, 0x43, 0x44, 0x45, 0x46,
                                    0x47, 0x48, 0x49, 0x4a, 0x4b, 0x4c,
                                    0x4d, 0x4e, 0x4f, 0x50, 0x51, 0x52,
                                    0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
                                    0x59, 0x5a]);
    });

    test('equalArrays', function() {
      var equals = NfcUtils.equalArrays(NfcUtils.fromUTF8(string1),
                                        uint8array1);
      assert.equal(equals, true);
    });

    test('transitive', function() {
      var u8a = NfcUtils.fromUTF8(string1);
      var str = NfcUtils.toUTF8(uint8array1);
      var backStr = NfcUtils.toUTF8(u8a);
      var backU8a = NfcUtils.fromUTF8(str);
      var nullObj = NfcUtils.toUTF8(null);
      var nullStr = NfcUtils.fromUTF8(null);

      var u1 = NfcUtils.equalArrays(u8a, uint8array1);
      var s1 = NfcUtils.equalArrays(str, string1);
      var bs1 = NfcUtils.equalArrays(string1, backStr);
      var bs2 = NfcUtils.equalArrays(str, backStr);
      var bu1 = NfcUtils.equalArrays(u8a, backU8a);
      var bu2 = NfcUtils.equalArrays(uint8array1, backU8a);

      assert.equal(u1, true);
      assert.equal(s1, true);
      assert.equal(bs1, true);
      assert.equal(bs2, true);
      assert.equal(bu1, true);
      assert.equal(bu2, true);
      assert.equal(nullObj, null);
      assert.equal(nullStr, null);
    });

  });

  suite('NDEF Conversions', function() {
    var urlNDEF; // MozNDEFRecord
    var urlU8a; // Uint8Array

    setup(function() {
      var tnf     = NDEF.TNF_WELL_KNOWN;
      var type    = NDEF.RTD_URI;
      var id      = new Uint8Array(); // no id.
      // Short Record, 0x3 or "http://"
      var payload = new Uint8Array(NfcUtils.fromUTF8(
                                   '\u0003mozilla.org'));

      urlNDEF = new MozNDEFRecord(tnf, type, id, payload);

      // SR = 1, TNF = 0x01 (NFC Forum Well Known Type),
      // One record only: ME=1, MB=1
      urlU8a = new Uint8Array([0xd1, // TNF and header
                               0x01, // Record type length
                               0x0c, // payload length
                               0x55, // 'U',  NDEF.RTD_URI type
                               0x03, // NDEF.URIS[0x03] = 'http://';
                               0x6d, 0x6f, 0x7a, 0x69, 0x6c, 0x6c, 0x61,
                               0x2e,
                               0x6f, 0x72, 0x67]); // SR: mozilla.org

    });

    test('encodeNDEF Subrecord', function() {
      var encodedNdefU8a = NfcUtils.encodeNDEF([urlNDEF]);
      // MozNDEFRecord is abstract, and does not contain some extra bits in the
      // header for NDEF payload subrecords:
      var cpUrlU8a = new Uint8Array(encodedNdefU8a);
      cpUrlU8a[0] = cpUrlU8a[0] & NDEF.TNF;

      var equals1 = NfcUtils.equalArrays(encodedNdefU8a, urlU8a);
      assert.equal(equals1, true);
    });

    test('parseNDEF Subrecord', function() {
      var buf = new NfcBuffer(urlU8a);
      var ndefrecords = NfcUtils.parseNDEF(buf);
      var equal;
      // There is only one record here:
      assert.equal(ndefrecords[0].tnf, NDEF.TNF_WELL_KNOWN);
      equal = NfcUtils.equalArrays(ndefrecords[0].type, NDEF.RTD_URI);
      assert.equal(equal, true);

      equal = NfcUtils.equalArrays(ndefrecords[0].id, new Uint8Array());
      assert.equal(equal, true);

      equal = NfcUtils.equalArrays(ndefrecords[0].payload,
                                 NfcUtils.fromUTF8('\u0003mozilla.org'));
      assert.equal(equal, true);
    });

    test('Encode and Parse Handover Request', function() {
      var mac = '01:02:03:04:05:06';
      var cps = 0x2;
      var rnd = 3141592654;
      var hrNDEFs1 = NfcManagerUtils.encodeHandoverRequest(mac, cps, rnd);
      assert.equal(!!hrNDEFs1, true);
      var hrNDEFU8a1 = NfcUtils.encodeNDEF(hrNDEFs1);
      assert.equal(!!hrNDEFU8a1, true);

      var buf = new NfcBuffer(hrNDEFU8a1);
      var hrNDEFs2 = NfcUtils.parseNDEF(buf);
      assert.equal(!!hrNDEFs2, true);

      var hrNDEFU8a2 = NfcUtils.encodeNDEF(hrNDEFs2);
      assert.equal(!!hrNDEFU8a2, true);

      var equal1 = NfcUtils.equalArrays(hrNDEFU8a2, hrNDEFU8a1);
      assert.equal(equal1, true);
    });

    test('Encode and Parse Handover Select', function() {
      var mac = '01:02:03:04:05:06';
      var cps = 0x2;
      var hsNDEFs1 = NfcManagerUtils.encodeHandoverSelect(mac, cps);
      assert.equal(!!hsNDEFs1, true);

      var hsNDEFU8a1 = NfcUtils.encodeNDEF(hsNDEFs1);
      assert.equal(!!hsNDEFU8a1, true);

      var buf = new NfcBuffer(hsNDEFU8a1);
      var hsNDEFs2 = NfcUtils.parseNDEF(buf);
      assert.equal(!!hsNDEFs2, true);

      var hsNDEFU8a2 = NfcUtils.encodeNDEF(hsNDEFs2);
      assert.equal(!!hsNDEFU8a2, true);

      var equal1 = NfcUtils.equalArrays(hsNDEFU8a2, hsNDEFU8a1);
      assert.equal(equal1, true);
    });

  });

  suite('Activity Routing', function() {
    var vcard;
    var activityInjection1;
    var activityInjection2;
    var activityInjection3;

    setup(function() {
      vcard = 'BEGIN:VCARD\n';
      vcard += 'VERSION:2.1\n';
      vcard += 'N:Office;Mozilla;;;\n';
      vcard += 'FN:Mozilla Office\n';
      vcard += 'TEL;PREF:1-555-555-5555\n';
      vcard += 'END:VCARD';

      activityInjection1 = {
        type: 'techDiscovered',
        techList: ['P2P', 'NDEF'],
        records: [{
          tnf: NDEF.TNF_MIME_MEDIA,
          type: NfcUtils.fromUTF8('text/vcard'),
          id: new Uint8Array(),
          payload: NfcUtils.fromUTF8(vcard)
        }],
        sessionToken: '{e9364a8b-538c-4c9d-84e2-e6ce524afd17}'
      };
      activityInjection2 = {
        type: 'techDiscovered',
        techList: ['P2P', 'NDEF'],
        records: [{
          tnf: NDEF.TNF_MIME_MEDIA,
          type: NfcUtils.fromUTF8('text/x-vcard'),
          id: new Uint8Array(),
          payload: NfcUtils.fromUTF8(vcard)
        }],
        sessionToken: '{e9364a8b-538c-4c9d-84e2-e6ce524afd18}'
      };
      activityInjection3 = {
        type: 'techDiscovered',
        techList: ['P2P', 'NDEF'],
        records: [{
          tnf: NDEF.TNF_MIME_MEDIA,
          type: NfcUtils.fromUTF8('text/x-vCard'),
          id: new Uint8Array(),
          payload: NfcUtils.fromUTF8(vcard)
        }],
        sessionToken: '{e9364a8b-538c-4c9d-84e2-e6ce524afd19}'
      };
    });

    test('text/vcard', function() {
      var stubFormatVCardRecord = this.sinon.spy(NfcManager,
                                                 'formatVCardRecord');

      NfcManager.handleTechnologyDiscovered(activityInjection1);
      assert.isTrue(stubFormatVCardRecord.calledOnce);

      NfcManager.handleTechnologyDiscovered(activityInjection2);
      assert.isTrue(stubFormatVCardRecord.calledTwice);

      NfcManager.handleTechnologyDiscovered(activityInjection3);
      assert.isTrue(stubFormatVCardRecord.calledThrice);
    });
  });

  suite('NFC Manager Dispatch Events', function() {
    var aUUID = '{4f4787c4-51f0-4288-8caf-55d440303b0b}';
    var vcard;

    setup(function() {
      vcard = 'BEGIN:VCARD\n';
      vcard += 'VERSION:2.1\n';
      vcard += 'END:VCARD';
    });

    test('NFC Manager Outgoing DispatchEvents', function() {
      var command = {
        sessionToken: aUUID,
        techList: ['NDEF'],
        records: [{
          tnf: NDEF.TNF_MIME_MEDIA,
          type: NfcUtils.fromUTF8('text/vcard'),
          id: new Uint8Array(),
          payload: NfcUtils.fromUTF8(vcard)
        }]
      };

      var stubDispatchEvent = this.sinon.stub(window, 'dispatchEvent');

      NfcManager.handleTechnologyDiscovered(command);
      assert.isTrue(stubDispatchEvent.calledOnce);
      assert.equal(stubDispatchEvent.getCall(0).args[0].type,
                   'nfc-tech-discovered');

      NfcManager.handleTechLost(command);
      assert.isTrue(stubDispatchEvent.calledThrice);
      assert.equal(stubDispatchEvent.getCall(1).args[0].type, 'nfc-tech-lost');
      assert.equal(stubDispatchEvent.getCall(2).args[0].type, 'shrinking-stop');
    });

  });

  suite('NFC Manager changeHardwareState test', function() {
    var realNfc = navigator.mozNfc;

    setup(function() {
      navigator.mozNfc = MockNfc;
    });

    teardown(function() {
      navigator.mozNfc = realNfc;
    });

    test('NFC Manager startPoll', function() {
      var stubStartPoll = this.sinon.spy(MockNfc, 'startPoll');
      var stubStopPoll = this.sinon.spy(MockNfc, 'stopPoll');
      var stubPowerOff = this.sinon.spy(MockNfc, 'powerOff');
      var stubDispatchEvent = this.sinon.spy(window, 'dispatchEvent');

      NfcManager.changeHardwareState(NfcManager.NFC_HW_STATE_OFF);
      assert.isTrue(stubPowerOff.calledOnce);
      assert.isTrue(stubDispatchEvent.calledOnce);

      NfcManager.changeHardwareState(NfcManager.NFC_HW_STATE_ON);
      assert.isTrue(stubStartPoll.calledOnce);
      assert.isTrue(stubDispatchEvent.calledTwice);

      NfcManager.changeHardwareState(NfcManager.NFC_HW_STATE_ENABLE_DISCOVERY);
      assert.isTrue(stubStartPoll.calledTwice);

      NfcManager.changeHardwareState(NfcManager.NFC_HW_STATE_DISABLE_DISCOVERY);
      assert.isTrue(stubStopPoll.calledOnce);
    });
  });

  suite.skip('handleNdefMessage not supported records', function() {
    test('TNF well known rtd text utf 16', function() {
      console.log(this);
      var payload = Uint8Array([-126, 101, 110, -1,
                                 -2, 72, 0, 111,
                                  0, 33, 0, 32,
                                  0, 85, 0, 84,
                                  0, 70, 0, 45,
                                  0, 49, 0, 54,
                                  0, 32, 0, 101,
                                  0, 110, 0]);

      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_WELL_KNOWN,
                                            NDEF.RTD_TEXT,
                                            new Uint8Array(),
                                            payload)];

      var activityOptions1 = NfcManager.handleNdefMessage(dummyNdefMsg);
      assert.equal(activityOptions1.name, 'nfc-ndef-discovered');
      assert.equal(activityOptions1.data.type, 'text');
      assert.equal(activityOptions1.data.text, 'Ho! UTF-16 en');
      assert.equal(activityOptions1.data.rtd, NDEF.RTD_TEXT);
      assert.equal(activityOptions1.data.language, 'en');
      assert.equal(activityOptions1.data.encoding, 'UTF-16');
      assert.equal(activityOptions1.data.records, dummyNdefMsg);
    });

    test('TNF absolute uri', function() {
      //TNF_ABSOLUTE_URI has uri in the type
      var type = new Uint8Array([0x68, 0x74, 0x74, 0x70,
                                 0x3A, 0x2F, 0x2F, 0x6D,
                                 0x6F, 0x7A, 0x69, 0x6C,
                                 0x6C, 0x61, 0x2E, 0x6F,
                                 0x72, 0x67]);
      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_ABSOLUTE_URI,
                                            type,
                                            new Uint8Array(),
                                            new Uint8Array())];
      
      
      var activityOptions = NfcManager.handleNdefMessage(dummyNdefMsg);
      assert.equal(activityOptions.name, 'nfc-ndef-discovered');
      assert.equal(activityOptions.data.type, 'http://mozilla.org');
      assert.equal(activityOptions.data.records, dummyNdefMsg);
    });
  });
});
