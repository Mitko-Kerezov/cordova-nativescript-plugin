cordova.define('cordova/plugin_list', function(require, exports, module) {
module.exports = [
    {
        "id": "cordova-plugin-email-composer.EmailComposer",
        "file": "cordova-plugin-email-composer/www/email_composer.js",
        "pluginId": "cordova-plugin-email-composer",
        "clobbers": [
            "cordova.plugins.email",
            "plugin.email"
        ]
    },
    {
        "id": "com.synconset.imagepicker.ImagePicker",
        "file": "cordova-plugin-telerik-imagepicker/www/imagepicker.js",
        "pluginId": "com.synconset.imagepicker",
        "clobbers": [
            "plugins.imagePicker"
        ]
    }
];
module.exports.metadata =
// TOP OF METADATA
{
    "cordova-plugin-email-composer": "0.8.15",
    "com.synconset.imagepicker": "2.1.10"
};
// BOTTOM OF METADATA
});