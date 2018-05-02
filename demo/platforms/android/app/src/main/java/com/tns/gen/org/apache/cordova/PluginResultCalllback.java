package com.tns.gen.org.apache.cordova;

public class PluginResultCalllback implements org.apache.cordova.PluginResultCalllback {
	public PluginResultCalllback() {
		com.tns.Runtime.initInstance(this);
	}

	public void sendPluginResult(org.apache.cordova.PluginResult param_0, java.lang.String param_1)  {
		java.lang.Object[] args = new java.lang.Object[2];
		args[0] = param_0;
		args[1] = param_1;
		com.tns.Runtime.callJSMethod(this, "sendPluginResult", void.class, args);
	}

}
