var storeReCaptcha = storeReCaptcha || {}

storeReCaptcha = (function() {
    "use strict";

    var config = {
        publicKey: null,
        version: null,
        form: null,
        validation: null,
        callback: null
    }

    function init(configPublicKey, configVersion, configForm, configValidation, configCallback) {
        console.log('[Store reCAPTCHA] Init');
        config.publicKey = configPublicKey;
        config.version = configVersion;
        config.form = configForm;
        config.validation = configValidation;
        config.callback = configCallback;

        __compatibility();
        __start();

        var scriptCallback = (configVersion === 'v2') ? 'callbackReCaptchaV2' : 'callbackReCaptchaV3';
        var ScriptReCAPTCHA = 'https://www.recaptcha.net/recaptcha/api.js?onload=' + scriptCallback + '&render=' + configPublicKey;

        var reCaptchaImportScript = document.createElement("script");
        reCaptchaImportScript.setAttribute("src", ScriptReCAPTCHA);
        reCaptchaImportScript.setAttribute("async", 'true');
        reCaptchaImportScript.setAttribute("defer", 'true');
        document.body.appendChild(reCaptchaImportScript);
    }

    function callback_v2() {
        console.log('[reCAPTCHA v2] Callback');

        document.querySelector('.btn_submit').setAttribute('onclick', 'storeReCaptcha.submit()');
    }

    function callback_v3() {
        console.log('[reCAPTCHA v3] Callback');

        document.querySelector('.btn_submit').setAttribute('onclick', 'storeReCaptcha.submit()');
    }

    function submit(token) {
        if (typeof config.validation == 'function' && config.validation() == false) {
            return false;
        }

        if (typeof config.callback == 'function') {
            config.callback();
        }
        if (config.version == 'v2') {
            if (Boolean(token)) {
                return __appendToken(token);
            }

            grecaptcha.execute();
            return;
        }

        if (config.version == 'v3') {
            grecaptcha.ready(function () {
                grecaptcha.execute(config.publicKey, {action: 'submit'}).then(function(v3Token) {
                    __appendToken(v3Token);
                });
            });
        }
    }

    function __compatibility() {
        Array.prototype.reduce = function(callback, initialVal) {
            var accumulator = (initialVal === undefined) ? undefined : initialVal;
            for (var i = 0; i < this.length; i++) {
                if (accumulator !== undefined)
                    accumulator = callback.call(undefined, accumulator, this[i], i, this);
                else
                    accumulator = this[i];
            }
            return accumulator;
        };
    }

    function __start() {
        if (config.version == 'v2') {
            var div = document.createElement('div');
            div.setAttribute('id', 'recaptcha');
            div.setAttribute('class', 'g-recaptcha');
            div.setAttribute('data-sitekey', config.publicKey);
            div.setAttribute('data-callback', 'submitReCaptcha');
            div.setAttribute('data-size', 'invisible');
            (config.form).append(div);
        }
    }

    function __appendToken(token) {
        var elementToken = document.getElementById('g-recaptcha-response');

        if(Boolean(elementToken)) {
            elementToken.value = token;
            (config.form).submit();
            return;
        }

        var input = document.createElement('input');
        input.setAttribute('type', 'hidden');
        input.setAttribute('name', 'g-recaptcha-response');
        input.setAttribute('id', 'g-recaptcha-response');
        input.setAttribute('value', token);
        (config.form).append(input);
        (config.form).submit();
    }

    return {
        init: init,
        config: config,
        callback_v2: callback_v2,
        callback_v3: callback_v3,
        submit: submit,
    }

})()

function callbackReCaptchaV3() {
    storeReCaptcha.callback_v3();
}

function callbackReCaptchaV2() {
    storeReCaptcha.callback_v2();
}

function submitReCaptcha(token) {
    if (Boolean(token)) {
        storeReCaptcha.submit(token);
    }
}
