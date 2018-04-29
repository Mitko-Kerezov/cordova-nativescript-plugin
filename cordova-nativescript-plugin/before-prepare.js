const path = require('path');
const fs = require('fs')
const convert = require('xml-js');
const mkdirp = require('mkdirp');
const fse = require('fs-extra')

const CORDOVA_PLUGINS_FILE = "cordova_plugins.js";
const PLUGIN_NAME = "cordova-nativescript-plugin"

module.exports = function ($logger, $projectData, $options, hookArgs) {
    const modulesFolder = path.join($projectData.projectDir, "node_modules");
    const isCordovaPlugin = source => fs.lstatSync(source).isDirectory() && path.basename(source) !== PLUGIN_NAME && fs.existsSync(path.join(source, 'plugin.xml'));
    const cordovaPluginsDirectories = fs.readdirSync(modulesFolder).map(moduleName => path.join(modulesFolder, moduleName)).filter(isCordovaPlugin);

    // const cordovaPluginsDirectories = ['D:\\work\\ImagePicker'];
    console.log(cordovaPluginsDirectories);
    const jsModules = [];
    const jsMetadata = {};
    cordovaPluginsDirectories.forEach(dir => {
        const pluginXml = fs.readFileSync(path.join(dir, 'plugin.xml'), 'utf8');
        const options = { ignoreComment: true, alwaysChildren: true, trim: true };
        const result = convert.xml2js(pluginXml, options);

        const plugin = result.elements[0];
        const pluginId = plugin.attributes.id;
        const version = plugin.attributes.version;
        jsMetadata[pluginId] = version;
        plugin.elements.forEach(element => {
            if (element.name === "js-module") {
                populateJsModule(jsModules, element, pluginId, dir);
            }

            if (element.name === "platform" && element.attributes.name === "android") {
                handleAndroidPlatform(element, dir);
            }
        });
    });

    writePluginsFile(jsModules, jsMetadata, modulesFolder);
}

function handleAndroidPlatform(element, rootDir) {
    const elements = element.elements
    const frameworks = [];
    const androidDir = path.join(rootDir, "platforms", 'android');
    elements.forEach(element => {
        if (element.name === "source-file") {
            mkdirp.sync(androidDir)
            const targetDir = path.join(androidDir, 'java')
            const src = path.join(rootDir, element.attributes.src)
            console.log(src)
            const filename = path.basename(src);
            const destination = path.join(targetDir, filename);

            mkdirp.sync(targetDir)
            fse.copySync(src, destination);
        }

        if (element.name === "resource-file") {
            mkdirp.sync(androidDir)
            const target = element.attributes.target
            const targetDir = path.join(androidDir, path.dirname(target))
            const src = path.join(rootDir, element.attributes.src)
            const destination = path.join(androidDir, target);

            mkdirp.sync(targetDir)
            fse.copySync(src, destination);
        }

        if (element.name === "framework") {
            mkdirp.sync(androidDir)
            if (element.attributes.custom) {
                const src = path.join(rootDir, element.attributes.src)
                const fileName = path.basename(src)
                const destination = path.join(androidDir, fileName);
                console.log(src)
                fse.copySync(src, destination);
            } else {
                frameworks.push(element.attributes.src)
            }
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
}

function populateJsModule(jsModules, element, pluginId, rootDir) {
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

    addCordovaDefine(path.join(rootDir, jsSrc), jsModule.id);
    jsModules.push(jsModule);
}

function addCordovaDefine(filePath, defineName) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    if (!fileContent.trim().startsWith("cordova.define")) {
        const modifiedFile = `cordova.define("${defineName}", function (require, exports, module) { \n ${fileContent} \n});`;
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
