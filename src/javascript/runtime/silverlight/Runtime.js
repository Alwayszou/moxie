/**
 * RunTime.js
 *
 * Copyright 2013, Moxiecode Systems AB
 * Released under GPL License.
 *
 * License: http://www.plupload.com/license
 * Contributing: http://www.plupload.com/contributing
 */

/*jshint smarttabs:true, undef:true, unused:true, latedef:true, curly:true, bitwise:true, scripturl:true, browser:true */
/*global define:true, ActiveXObject:true */

/**
Defines constructor for Silverlight runtime.

@class moxie/runtime/silverlight/Runtime
@private
*/
define("moxie/runtime/silverlight/Runtime", [
	"moxie/core/utils/Basic",
	"moxie/core/utils/Env",
	"moxie/core/utils/Dom",
	"moxie/core/Exceptions",
	"moxie/runtime/Runtime"
], function(Basic, Env, Dom, x, Runtime) {
	
	var type = 'silverlight', extensions = {};

	/**
	Constructor for the Silverlight Runtime

	@class SilverlightRuntime
	@extends Runtime
	*/
	Runtime.addConstructor(type, (function() {

		function SilverlightRuntime(options) {
			var I = this, initTimer;

			function isInstalled(version) {
				var isVersionSupported = false, control = null, actualVer,
					actualVerArray, reqVerArray, requiredVersionPart, actualVersionPart, index = 0;

				try {
					try {
						control = new ActiveXObject('AgControl.AgControl');

						if (control.IsVersionSupported(version)) {
							isVersionSupported = true;
						}

						control = null;
					} catch (e) {
						var plugin = navigator.plugins["Silverlight Plug-In"];

						if (plugin) {
							actualVer = plugin.description;

							if (actualVer === "1.0.30226.2") {
								actualVer = "2.0.30226.2";
							}

							actualVerArray = actualVer.split(".");

							while (actualVerArray.length > 3) {
								actualVerArray.pop();
							}

							while ( actualVerArray.length < 4) {
								actualVerArray.push(0);
							}

							reqVerArray = version.split(".");

							while (reqVerArray.length > 4) {
								reqVerArray.pop();
							}

							do {
								requiredVersionPart = parseInt(reqVerArray[index], 10);
								actualVersionPart = parseInt(actualVerArray[index], 10);
								index++;
							} while (index < reqVerArray.length && requiredVersionPart === actualVersionPart);

							if (requiredVersionPart <= actualVersionPart && !isNaN(requiredVersionPart)) {
								isVersionSupported = true;
							}
						}
					}
				} catch (e2) {
					isVersionSupported = false;
				}

				return isVersionSupported;
			}

			Runtime.call(this, type, Basic.extend({}, { xap_url: Env.xap_url }, options));

			Basic.extend(this, {

				getShim: function() {
					return Dom.get(this.uid).content.Moxie;
				},

				init : function() {
					var container;

					// minimal requirement Flash Player 10
					if (!isInstalled('2.0.31005.0') || Env.browser === 'Opera') {
						this.trigger("Error", new x.RuntimeError(x.RuntimeError.NOT_INIT_ERR));
						return;
					}

					container = this.getShimContainer();

					container.innerHTML = '<object id="' + this.uid + '" data="data:application/x-silverlight," type="application/x-silverlight-2" width="100%" height="100%" style="outline:none;">' +
						'<param name="source" value="' + options.xap_url + '"/>' +
						'<param name="background" value="Transparent"/>' +
						'<param name="windowless" value="true"/>' +
						'<param name="enablehtmlaccess" value="true"/>' +
						'<param name="initParams" value="uid=' + this.uid + ',target=' + Env.global_event_dispatcher + '"/>' +
					'</object>';

					// Init is dispatched by the shim
					initTimer = setTimeout(function() {
						if (I && !I.initialized) { // runtime might be already destroyed by this moment
							I.trigger("Error", new x.RuntimeError(x.RuntimeError.NOT_INIT_ERR));
						}
					}, 5000); // silverlight may take quite some time to initialize
				},

				destroy: (function(destroy) { // extend default destroy method
					return function() {
						destroy.call(I);
						clearTimeout(initTimer); // initialization check might be still onwait
						initTimer = destroy = I = null;
					};
				}(this.destroy))

			}, extensions);
		}


		SilverlightRuntime.can = (function() {
			var use_clienthttp = function() {
					var rc = this.options.required_caps || {};
					return  rc.send_custom_headers || 
						rc.return_status_code && Basic.arrayDiff(rc.return_status_code, [200, 404]) ||
						rc.use_http_method && Basic.arrayDiff(rc.use_http_method, ['GET', 'POST']); 
				},

				caps = Basic.extend({}, Runtime.caps, {
					access_binary: true,
					access_image_binary: true,
					display_media: true,
					drag_and_drop: false,
					report_upload_progress: true,
					resize_image: true,
					return_response_headers: function() {
						return use_clienthttp.call(this);
					},
					return_response_type: true,
					return_status_code: function(code) {
						return use_clienthttp.call(this) || !Basic.arrayDiff(code, [200, 404]);
					},
					select_multiple: true,
					send_binary_string: true,
					send_browser_cookies: function() {
						return !use_clienthttp.call(this);
					},
					send_custom_headers: function() {
						return use_clienthttp.call(this);
					},
					send_multipart: true,
					slice_blob: true,
					stream_upload: true,
					summon_file_dialog: false,
					upload_filesize: true,
					use_http_method: function(methods) {
						return use_clienthttp.call(this) || !Basic.arrayDiff(methods, ['GET', 'POST']);
					}
				});

			function can() {
				var args = [].slice.call(arguments);
				args.unshift(caps);
				return Runtime.can.apply(this, args);
			}
			return can;
		}());

		return SilverlightRuntime;
	}()));

	return extensions;
});
