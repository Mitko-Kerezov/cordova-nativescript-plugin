const path = require('path');
const fs = require('fs')
const convert = require('xml-js');
const mkdirp = require('mkdirp');
const xpath = require('xpath');
const DOMParser = require('xmldom').DOMParser;
const XMLSerializer = require('xmldom').XMLSerializer;
const fse = require('fs-extra')

const CORDOVA_PLUGINS_FILE = "cordova_plugins.js";
const CORDOVA_FEATURES_FILE = "cordova_features.json";
const PLUGIN_NAME = "cordova-nativescript-plugin"
const ANDROID_MANIFEST_FILE_NAME = "AndroidManifest.xml";
const PACKAGE_JSON_FILE_NAME = "package.json";

module.exports = function ($projectData, hookArgs) {
    const getPluginXml = dir => path.join(dir, "plugin.xml")
    const modulesFolder = path.join($projectData.projectDir, "node_modules");
    const isCordovaPlugin = source => fs.lstatSync(source).isDirectory() && path.basename(source) !== PLUGIN_NAME && fs.existsSync(getPluginXml(source));
    const cordovaPluginsDirectories = fs.readdirSync(modulesFolder).map(moduleName => path.join(modulesFolder, moduleName)).filter(isCordovaPlugin);

    const jsModules = [];
    const features = {};
    const jsMetadata = {};
    cordovaPluginsDirectories.forEach(dir => {
        const pluginXml = fs.readFileSync(getPluginXml(dir), 'utf8');
        const options = { ignoreComment: true, alwaysChildren: true, trim: true };
        const result = convert.xml2js(pluginXml, options);

        const plugin = result.elements[0];
        const pluginId = plugin.attributes.id;
        const version = plugin.attributes.version;
        jsMetadata[pluginId] = version;
        plugin.elements.forEach(element => {
            if (element.name === "js-module") {
                populateJsModule(jsModules, element, pluginId, dir, hookArgs);
            }

            if (element.name === "platform") {
                if (element.attributes.name === "android") {
                    handleAndroidPlatform(element, dir, features);
                }

                addNativeScriptKeyToPackageJsonIfNecessary(dir)
            }


        });
    });

    writePluginsFile(jsModules, jsMetadata, modulesFolder);
    fs.writeFileSync(path.join(modulesFolder, PLUGIN_NAME, CORDOVA_FEATURES_FILE), JSON.stringify(features));
}

function addNativeScriptKeyToPackageJsonIfNecessary(rootDir) {
    const packageJsonFileLocation = path.join(rootDir, PACKAGE_JSON_FILE_NAME);
    const packageJsonContents = JSON.parse(fs.readFileSync(packageJsonFileLocation, 'utf8'));
    if (!packageJsonContents.nativescript) {
        packageJsonContents.nativescript = {
            platforms: {
                android: "4.0.0",
                ios: "4.0.0"
            }
        }

        fs.writeFileSync(packageJsonFileLocation, JSON.stringify(packageJsonContents));
    }
}

function handleAndroidPlatform(element, rootDir, features) {
    const elements = element.elements
    const frameworks = [];
    const androidDir = path.join(rootDir, "platforms", 'android');
    const androidManifestContents = `<?xml version="1.0" encoding="utf-8"?>
    <manifest xmlns:android="http://schemas.android.com/apk/res/android">
        <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />

        <application>
        </application>
    </manifest>`;
    const document = new DOMParser().parseFromString(androidManifestContents);
    let shouldWriteManifest = false;
    const pluginManifestPath = path.join(androidDir, ANDROID_MANIFEST_FILE_NAME);
    const pluginManifestExists = fs.existsSync(pluginManifestPath);
    elements.forEach(element => {
        let targetDir, src, destination, target;
        switch (element.name) {
            case "source-file":
                mkdirp.sync(androidDir)
                const originalTargetDir = element.attributes['target-dir'];
                if (!originalTargetDir || originalTargetDir.indexOf("src") === 0) {
                    targetDir = path.join(androidDir, 'java')
                } else {
                    targetDir = path.join(androidDir, originalTargetDir)
                }
                src = path.join(rootDir, element.attributes.src)
                filename = path.basename(src);
                destination = path.join(targetDir, filename);

                mkdirp.sync(targetDir)
                fse.copySync(src, destination);
                break;
            case "resource-file":
                mkdirp.sync(androidDir)
                target = element.attributes.target
                targetDir = path.join(androidDir, path.dirname(target))
                src = path.join(rootDir, element.attributes.src)
                destination = path.join(androidDir, target);

                mkdirp.sync(targetDir)
                fse.copySync(src, destination);
                break;
            case "framework":
                mkdirp.sync(androidDir)
                if (element.attributes.custom) {
                    src = path.join(rootDir, element.attributes.src)
                    filename = path.basename(src)
                    destination = path.join(androidDir, filename);
                    fse.copySync(src, destination);
                } else {
                    frameworks.push(element.attributes.src)
                }

                break;
            case "config-file":
                if (!pluginManifestExists) {
                    if (element.attributes.target === ANDROID_MANIFEST_FILE_NAME) {
                        shouldWriteManifest = true;
                        let xpathPattern = element.attributes.parent || "/manifest";
                        const xpathPatternFirstSymbol = xpathPattern[0];
                        if (xpathPatternFirstSymbol !== '/' && xpathPatternFirstSymbol !== '*') {
                            xpathPattern = `*/${xpathPattern}`
                        }

                        const parentNode = xpath.select(xpathPattern, document)[0];
                        const childNode = new DOMParser().parseFromString(convert.js2xml(element));
                        parentNode.appendChild(childNode);
                    }
                }

                if (element.attributes.target && element.attributes.target.indexOf("config.xml") > -1) {
                    element.elements.forEach(possibleFeatureElement => {
                        if (possibleFeatureElement.name === "feature") {
                            const featureName = possibleFeatureElement.attributes.name;
                            possibleFeatureElement.elements.forEach(featureChildElement => {
                                if (featureChildElement.name === "param" && featureChildElement.attributes.name === "android-package") {
                                    features[featureName] = featureChildElement.attributes.value;
                                }
                            });
                        }
                    });
                }

                break;
        }
    });

    if (frameworks.length) {
        const fileContent = `/* Include.gradle configuration: http://docs.nativescript.org/plugins/plugins#includegradle-specification */
android {

}
allprojects {
    repositories{
        flatDir{
                dirs '../../../node_modules/cordova-nativescript-plugin/platforms/android'
        }
    }
}

dependencies {
    ${frameworks.map(dep => 'compile "' + dep + '"').join('\n')}
    compileOnly (name: 'cordova_nativescript_plugin', ext: 'aar')
}`
        fs.writeFileSync(path.join(androidDir, 'include.gradle'), fileContent);
    }

    if (shouldWriteManifest) {
        // An empty xmlns:android is generated whenever a child element is appended to the manifest
        // because child elements access the android namespace but are created as separate elements from the root manifest element
        // these empty namespaces cause gradle to fail so it is necessary to strip them.
        fs.writeFileSync(pluginManifestPath, new XMLSerializer().serializeToString(document).replace(/xmlns:android=""/g, ""));
    }
}

function populateJsModule(jsModules, element, pluginId, rootDir, hookArgs) {
    let jsModule = {};
    const jsSrc = element.attributes.src;
    const name = element.attributes.name;
    jsModule.id = `${pluginId}.${name}`
    jsModule.file = path.join(path.basename(rootDir), jsSrc).replace(/\\/g, '/');
    jsModule.pluginId = pluginId;
    jsModule.clobbers = []
    const childElements = element.elements;
    childElements.forEach(chEl => {
        if (chEl.name === "clobbers") {
            const clobber = chEl.attributes.target;
            jsModule.clobbers.push(clobber)
        }
    });

    addCordovaDefine(path.join(rootDir, jsSrc), jsModule.id, hookArgs);
    jsModules.push(jsModule);
}

function addCordovaDefine(filePath, defineName, hookArgs) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    if (!fileContent.trim().startsWith("cordova.define")) {
        const modifiedFile = `cordova.define("${defineName}", function (require, exports, module) {
// GENERATED CODE
const window = module.exports;
const navigator = {
    appCodeName: "NativeScript",
    appName: "NativeScript",
    appVersion: "1.0.0",
    cookieEnabled: false,
    geolocation: {},
    language: "en-US",
    onLine: true,
    platform: "${hookArgs.platform}",
    product: "NativeScript",
    userAgent: "NativeScript for ${hookArgs.platform}"
};
window.navigator = navigator;
// ~GENERATED CODE
            ${fileContent}
});`;
        fs.writeFileSync(filePath, modifiedFile);
    }
}

function writePluginsFile(jsModules, jsMetadata, modulesFolder) {
    const cordovaPluginFileContent = `cordova.define('cordova/plugin_list', function(require, exports, module) {
module.exports = ${toPrettyJson(jsModules)};
module.exports.metadata =
// TOP OF METADATA
${toPrettyJson(jsMetadata)};
// BOTTOM OF METADATA
});`

    fs.writeFileSync(path.join(modulesFolder, PLUGIN_NAME, CORDOVA_PLUGINS_FILE), cordovaPluginFileContent)
}

function toPrettyJson(object) {
    return JSON.stringify(object, null, 4);
}
