'use strict';

suite('NFCItem', function() {
  var realMozNfc;

  var map = {
    '*': {
      'shared/settings_listener':'shared_mocks/mock_settings_listener'
    }
  };

  var modules = [
    'panels/root/nfc_item',
    'shared_mocks/mock_settings_listener',
  ];

  setup(function(done) {
    var requireCtx = testRequire([], map, function() {});

    requireCtx(modules, (NFCItem, MockSettingsListener) => {
      var div = document.createElement('div');
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      div.appendChild(checkbox);

      this.div = div;
      this.checkbox = checkbox;
      this.NFCItem = NFCItem;
      this.MockSettingsListener = MockSettingsListener;

      realMozNfc = window.navigator.mozNfc;
      window.navigator.mozNfc = {};

      done();
    });
  });

  teardown(function() {
    window.navigator.mozNfc = realMozNfc;
  });

  test('is hidden if mozNfc is undefined', function() {
    delete window.navigator.mozNfc;

    var nfcItem = this.NFCItem({
      nfcMenuItem: this.div,
      nfcCheckBox: this.checkbox
    });

    assert.isTrue(this.div.hidden, 'hidden');
    assert.isUndefined(nfcItem._checkbox, 'checkbox');
  });

  test('is visible and initialized if mozNfc defined', function() {
    var stubAddListener = this.sinon.stub(this.checkbox, 'addEventListener');
    var stubObserver = this.sinon.stub(this.MockSettingsListener, 'observe');

    var nfcItem = this.NFCItem({
      nfcMenuItem: this.div,
      nfcCheckBox: this.checkbox
    });

    assert.isFalse(this.div.hidden, 'hidden');
    assert.deepEqual(nfcItem._checkbox, this.checkbox);

    assert.isTrue(stubAddListener.calledOnce, 'addEventListener');
    assert.equal(stubAddListener.firstCall.args[0], 'change');

    assert.isTrue(stubObserver.calledOnce, 'observe');
    assert.equal(stubObserver.firstCall.args[0], 'nfc.status');
  });

  test('sets checkbox to disabled on "change" event', function() {
    var nfcItem = this.NFCItem({
      nfcMenuItem: this.div,
      nfcCheckBox: this.checkbox
    });
    assert.isFalse(nfcItem._checkbox.disabled, 'initially enabled');

    this.checkbox.dispatchEvent(new CustomEvent('change'));
    assert.isTrue(nfcItem._checkbox.disabled, 'disabled');
  });

  suite('NFC status changes', function() {
    var nfcItem;
    var stubNfcChanged;
    var handledStatus = ['enabled', 'disabled'];
    var ignoredStatus = ['enabling', 'disabling'];
    var allStatus = handledStatus.concat(ignoredStatus);

    setup(function() {
      nfcItem = this.NFCItem({
        nfcMenuItem: this.div,
        nfcCheckBox: this.checkbox
      });
      stubNfcChanged = this.sinon.spy(nfcItem, '_onNfcStatusChanged');
    });

    teardown(function() {
      stubNfcChanged.restore();
    });

    handledStatus.forEach((status) => {
      test('checkbox disabled, status:' + status + ', handling', function() {
        nfcItem._checkbox.disabled = true;
        nfcItem._checkbox.checked = false;

        this.MockSettingsListener.mTriggerCallback('nfc.status', status);
        assert.isTrue(stubNfcChanged.withArgs(status).calledOnce);
        assert.isFalse(nfcItem._checkbox.disabled);
        assert.equal(nfcItem._checkbox.checked, status === 'enabled');
      });
    });

    ignoredStatus.forEach((status) => {
      test('checkbox disabled, status:' + status + ', ignoring', function() {
        nfcItem._checkbox.disabled = true;
        nfcItem._checkbox.checked = true;

        this.MockSettingsListener.mTriggerCallback('nfc.status', status);
        assert.isTrue(stubNfcChanged.withArgs(status).calledOnce);
        assert.isTrue(nfcItem._checkbox.disabled);
        assert.isTrue(nfcItem._checkbox.checked);
      });
    });

    allStatus.forEach((status) => {
      test('checkbox enabled, status:' + status + ', ignoring', function() {
        nfcItem._checkbox.disabled = false;
        nfcItem._checkbox.checked = false;

        this.MockSettingsListener.mTriggerCallback('nfc.status', status);
        assert.isTrue(stubNfcChanged.withArgs(status).calledOnce);
        assert.isFalse(nfcItem._checkbox.disabled);
        assert.isFalse(nfcItem._checkbox.checked);
      });
    });
  });
});
