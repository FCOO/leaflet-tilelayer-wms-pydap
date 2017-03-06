/****************************************************************************
	wms-ajax-proxy.js, 

	(c) 2015, FCOO

	https://github.com/FCOO/leaflet-tilelayer-wms-pydap
	https://github.com/FCOO

****************************************************************************/
(function ($, window, document, undefined) {
	"use strict";
    /**
     * A JavaScript library for proxying metadata requests to WMS server.
     * The proxy merges requests that can be performed as single requests
     * to the pydap WMS service.
     *
     * It can be used by the pydap WMS tilelayer to merge metadata
     * requests for better performance (especially on high latency
     * connections).
     *
     * Usage:
     *
     * var wmsProxy = new MwsAjaxProxy()
     *
     * var ajaxOptions1 = {
     *     url: 'whatever',
     *     async: true
     * }
     * var ajaxOptions2 = {
     *     url: 'whatever',
     *     data: {
     *         mydata: 'example'
     *     }
     *     async: true
     * }
     * wmsProxy.deferredAjax(ajaxOptions1);
     * wmsProxy.deferredAjax(ajaxOptions2);
     * wmsProxy.doAjax();
     */
    var WmsAjaxProxy = {
        requests: [],
        deferredAjax: function (request) {
            // Put request into queue. Has the same signature as JQuery.ajax
            this.requests.push(request);
        },
        doAjax: function () {
            // Perform request
            var mergedRequests = this.mergeRequests();
            for (var key in mergedRequests) {
                if (mergedRequests.hasOwnProperty(key)) {
                    $.ajax(mergedRequests[key]);
                }
            }
        },
        mergeRequests: function () {
            // Merges requests for same dataset in requests list
            var i, reqDict = {};
            var arrayLength = this.requests.length;
            // Collect requests to same url
            for (i = 0; i < arrayLength; i++) {
                var req = this.requests[i];
                if (! reqDict.hasOwnProperty(req.url)) {
                    reqDict[req.url] = [req];
                } else {
                    reqDict[req.url].push(req);
                }
            }

            // Create merged requests
            var merDict = {};
            for (var key in reqDict) {
                if (reqDict.hasOwnProperty(key)) {
                    merDict[key] = {};
                    // When we have multiple requests we merge them, make a single
                    // request and call all appropriate callbacks with the proper
                    // context
                    var reqs = reqDict[key];
                    var reqsLength = reqs.length;
                    merDict[key].tryCount = reqs[0].tryCount;
                    merDict[key].retryLimit = reqs[0].retryLimit;
                    merDict[key].url = reqs[0].url;
                    merDict[key].timeout = reqs[0].timeout;
                    merDict[key].beforeSend = reqs[0].beforeSend;
                    merDict[key].cache = reqs[0].cache;
                    merDict[key].dataType = reqs[0].dataType;
                    merDict[key].async = reqs[0].async;
                    merDict[key].data = reqs[0].data;
                    merDict[key].context = [];
                    var layers = [];
                    // TODO: Check data contents identical
                    for (i = 0; i < reqsLength; i++) {
                        merDict[key].context.push({
                            key: key,
                            context: reqs[i].context,
                            success: reqs[i].success,
                            error: reqs[i].error
                        });
                        if (layers.indexOf(reqs[i].data.LAYERS) == -1) {
                            layers.push(reqs[i].data.LAYERS);
                        }
                    }
                    merDict[key].data.LAYERS = layers.join();
                    // FIXME: These functions should be moved out of the loop.
                    // Until then we tell jshint to be quiet
                    /* jshint loopfunc:true */
                    merDict[key].success = function (json, textStatus, jqXHR) {
                        var thisLength = this.length;
                        for (var i = 0; i < thisLength; i++) {
                            this[i].success.call(this[i].context, json, textStatus, jqXHR);
                        }
                    };
                    merDict[key].error = function (jqXHR, textStatus, err) {
                        var thisLength = this.length;
                        if (textStatus == 'timeout') {
                            // Retry request if any of the child requests specify tryCount and retryLimit
                            for (var i = 0; i < thisLength; i++) {
                                if (this[i].context.ajaxOptions.tryCount !== undefined && this[i].context.ajaxOptions.retryLimit !== undefined) {
                                    this[i].context.ajaxOptions.tryCount++;
                                    if (this[i].context.ajaxOptions.tryCount <= this[i].context.ajaxOptions.retryLimit) {
                                        // Try again
                                        //console.log('RETRYING', this[i].key, this[i].context.ajaxOptions.tryCount);
                                        $.ajax(merDict[this[i].key]);
                                        return;
                                    }
                                }
                                break;
                            }
                        }
                        // Otherwise call individual error handlers
                        for (var j = 0; j < thisLength; j++) {
                            this[j].error.call(this[j].context, jqXHR, textStatus, err);
                        }
                    };
                    /* jshint loopfunc:false */
                }
            }
            return merDict;
        }
    };
    window.WmsAjaxProxy = WmsAjaxProxy;

}(jQuery, this, document));
