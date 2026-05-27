document.addEventListener('DOMContentLoaded', function() {
	token = jQuery.now();
    jQuery('#loading').show();
    jQuery('#captcha-loader').hide();
    jQuery('#captcha-loader').html('');
    jQuery('#captcha-loader').append('<img src="/mvc/vendors/Captcha/index.php?t='+token+'">');
    jQuery('#captcha-loader').show();
    jQuery('#loading').hide();
    jQuery('#token').val(token);
});