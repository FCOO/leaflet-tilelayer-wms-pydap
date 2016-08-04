/****************************************************************************
	leaflet-tilelayer-wms-pydap.js, 

	(c) 2015, FCOO

	https://github.com/FCOO/leaflet-tilelayer-wms-pydap
	https://github.com/FCOO

****************************************************************************/
;(function ($, L, window, document, undefined) {
	"use strict";

	var protocol = window.location.protocol == 'https:' ? 'https:' : 'http:';

    /**
     * A JavaScript library for using Web Map Service layers from pydap
     * without hassle.
     */

    /* Error metadata request failures */
    function MetadataError(message) {
        this.name = 'MetadataError';
        this.message = message || 'Default Message';
        this.stack = (new Error()).stack;
    }
    MetadataError.prototype = Object.create(Error.prototype);
    MetadataError.prototype.constructor = MetadataError;

    /* Class representing a WMS tilelayer from Pydap */
    L.TileLayer.WMS.Pydap = L.TileLayer.WMS.extend({
        //baseUrl: protocol + "//{s}.fcoo.dk/webmap-staging/{dataset}.wms",
        baseUrl: protocol + "//{s}.fcoo.dk/webmap/{dataset}.wms",
        //baseUrl: "http://webmap-dev01:8080/{dataset}.wms",
        //baseUrl: "http://webmap-prod03:8080/{dataset}.wms",
        defaultWmsParams: {
            service: 'WMS',
            request: 'GetMap',
            version: '1.1.1',
            layers: '',
            styles: '',
            format: 'image/png',
            transparent: true,
        },
        defaultLegendParams: {
            request: 'GetColorbar',
            styles: 'horizontal,nolabel',
            cmap: '',
            show: false,
            imageUrl: null,
            position: 'bottomleft',
            attribution: null,
        },
        options: {
            language: 'en',
            bounds: null,
            tileSize: 512,
            opacity: 1.00,
            updateInterval: 50,
            subdomains: ['wms01', 'wms02', 'wms03', 'wms04'],
            maxZoom: 18,
            primadonna: true,
            foreground: null,
            crs: L.CRS.EPSG3857,
            attribution: 'Weather from <a href="http://fcoo.dk/" alt="Defence Centre for Operational Oceanography">FCOO</a>',
            onMetadataError: function(err) {
                window.noty({text: err.message, type: "error"});
                throw err;
            }
        },

        initialize: function (dataset, wmsParams, legendParams, options) {
            var that = this;
            this._basetileurl = this.baseUrl.replace('{dataset}', dataset);
            this._map = null;
            this._legendControl = null;
            this._legendId = null;
            this._dataset = dataset;
            this._gotMetadata = false;
            this.levels = undefined;
            this.timesteps = null;
            L.TileLayer.WMS.prototype.initialize.call(this, this._basetileurl, wmsParams);
            //$.extend(this.options, options);
            L.Util.setOptions(this, options);
            if (legendParams !== undefined && legendParams.show !== false) {
                legendParams.show = true;
                if (legendParams.cmap === undefined) {
                    legendParams.cmap = this.wmsParams.cmap;
                }
            }
            // Prune tiles from other timesteps when a new set is loaded
            this.on('load', function() {
                // TODO: Modify to do this as an animation
                this._pruneTiles();
            });
            this.legendParams = {};
            $.extend(this.legendParams, this.defaultLegendParams, legendParams);
            jQuery.support.cors = true;
            // We just select a subdomain to request capabilities from
            // based on the dataset name and layer names. This is simply
            // done to distribute the requests somewhat between the
            // subdomains.
            var subindex;
            if (this.options.hasOwnProperty('ajaxProxy')) {
                subindex = dataset.length;
            } else {
                subindex = dataset.length + this.wmsParams.layers.length;
            }
            subindex = subindex % this.options.subdomains.length;

            this._fcootileurl = L.Util.template(this._basetileurl, 
                           {s: this.options.subdomains[subindex]});

            // Request layer information from server
            this.ajaxOptions = {
              url: this._fcootileurl,
              timeout: 30000,
              tryCount: 0,
              retryLimit: 2,
              data: {
                      SERVICE: 'WMS',
                      REQUEST: 'GetMetadata',
                      VERSION: this.wmsParams.version,
                      ITEMS: 'epoch,last_modified,long_name,units,bounds,time,levels',
                      LAYERS: this.wmsParams.layers.split(':')[0].split(',')[0]
              },
              context: this,
              error: function(jqXHR, textStatus, err) {
                 if (! that.options.hasOwnProperty('ajaxProxy')) {
                     // Try events that time out again if not handled by ajaxProxy
                     if (textStatus == 'timeout') {
                         this.ajaxOptions.tryCount++;
                         if (this.ajaxOptions.tryCount <= this.ajaxOptions.retryLimit) {
                             $.ajax(this.ajaxOptions);
                             return;
                         }
                     }
                 }
                 this._error_metadata(jqXHR, textStatus, err);
              },
              success: function(json) {
                  this._got_metadata(json);
              },
              beforeSend: function(jqXHR, settings) {
                  jqXHR.url = settings.url;
              },
              cache: true,
              dataType: "json",
              async: true
            };
            // If ajaxProxy is provided through options we delegate the
            // ajax call to the provided function. Otherwise we use a
            // jQuery ajax call
            if (this.options.hasOwnProperty('ajaxProxy')) {
                this.options.ajaxProxy.deferredAjax(this.ajaxOptions);
            } else {
                $.ajax(this.ajaxOptions);
            }
        },

        setParamsListener: function (evt) {
            if (this.wmsParams.time !== 'current') {
                this.setParams({time: evt.datetime}, false, true);
            }
        },

        setParams: function (params, noRedraw, animate) {
            L.extend(this.wmsParams, params);
            if (!noRedraw) {
                this._abortLoading();
                if (this._map) {
                    this.redraw(animate);
                }
            }
            return this;
        },

        // We override the redraw function to not remove current tiles
        // to avoid blinking when setParams is called.
        redraw: function (animate) {
            if (this._map) {
                if (!animate) {
                    // This will remove all tiles
                    this._removeAllTiles();
                } else {
                    // This will remove tiles not marked as active
                    this._pruneTiles();
                }
                this._update();
            }
            return this;
        },

        // Converts tile coordinates to key for the tile cache. We override
        // this to include a time stamp as well.
        _tileCoordsToKey: function (coords) {
            return coords.x + ':' + coords.y + ':' + coords.z + ':' + coords.t;
        },

        // Private method to load tiles in the grid's active zoom level according to map bounds
        // We override it to exit if wmsParams.time is not defined and we add coords.t information.
        _update: function (center) {
            var i, j;
            var map = this._map;
            if (!map) { return; }
            // Do not add tiles if time has not been set
            if (!this.wmsParams.time) { return; }
            var zoom = map.getZoom();

            if (center === undefined) { center = map.getCenter(); }
            if (this._tileZoom === undefined) { return; }   // if out of minzoom/maxzoom

            var pixelBounds = this._getTiledPixelBounds(center),
                tileRange = this._pxBoundsToTileRange(pixelBounds),
                tileCenter = tileRange.getCenter(),
                queue = [];

            for (var key in this._tiles) {
                this._tiles[key].current = false;
            }

            // _update just loads more tiles. If the tile zoom level differs too much
            // from the map's, let _setView reset levels and prune old tiles.
            if (Math.abs(zoom - this._tileZoom) > 1) { this._setView(center, zoom); return; }

            // create a queue of coordinates to load tiles from
            for (j = tileRange.min.y; j <= tileRange.max.y; j++) {
                for (i = tileRange.min.x; i <= tileRange.max.x; i++) {
                    var coords = new L.Point(i, j);
                    coords.z = this._tileZoom;
                    coords.t = this.wmsParams.time;

                    if (!this._isValidTile(coords)) { continue; }

                    var tile = this._tiles[this._tileCoordsToKey(coords)];
                    if (tile) {
                        tile.current = true;
                    } else {
                        queue.push(coords);
                    }
                }
            }

            // sort tile queue to load tiles in order of their distance to center
            queue.sort(function (a, b) {
                return a.distanceTo(tileCenter) - b.distanceTo(tileCenter);
            });

            if (queue.length !== 0) {
                // if its the first batch of tiles to load
                if (!this._loading) {
                    this._loading = true;
                    this.fire('loading');
                }

                // create DOM fragment to append tiles in one batch
                var fragment = document.createDocumentFragment();

                for (i = 0; i < queue.length; i++) {
                    this._addTile(queue[i], fragment);
                }

                this._level.el.appendChild(fragment);
            }
        },

        // Make sure that we abort loading tiles 
        _abortLoading: function () {
            var i, tile;
            for (i in this._tiles) {
                if (this._tiles[i].coords.z !== this._tileZoom ||
                    this._tiles[i].coords.t !== this.wmsParams.time) {
                    tile = this._tiles[i].el;

                    tile.onload = L.Util.falseFn;
                    tile.onerror = L.Util.falseFn;

                    if (!tile.complete) {
                        tile.src = L.Util.emptyImageUrl;
                        L.DomUtil.remove(tile);
                    }
                }
            }
        },

        // TODO: Not yet functional
        prefetch: function (/*params, callback*/) {
            /* Fetches a layer which is identical to this layer except
             * what options the input params override. And the zIndex
             * is set to a very small value. 
             * NOTE: Could use opacity to hide layer instead
             */
            // Temporarily disabled
            return;

            /*
            var myWmsParams = $.extend({}, this.wmsParams, params);
            var myLegendParams = {show: false};
            if (! this._cacheLayer) {
                var myOptions = $.extend({}, this.options, {'zIndex': -2147483646});
                this._cacheLayer = new L.TileLayer.WMS.Pydap(this._dataset, myWmsParams, myLegendParams, myOptions);
                var map = this._map; // Closure
                this._cacheLayer.on('load', function(e) {
                    // First remove layer, then execute provided callback
                    //map.removeLayer(this._cacheLayer);
                    if (callback !== undefined) {
                        callback();
                    }
                });
                map.addLayer(this._cacheLayer);
            } else {
                this._cacheLayer.setParams(params, false, false);
            }
            */
        },

        // TODO: Not yet functional
        prefetchAll: function () {
            /* Fetches layers corresponding to all timesteps in this
             * layer starting from the current timestep.
             */
            var timesteps = this.timesteps;

            var _startTime = function (currentTime, timesteps) {
                /* Find current timestep - otherwise start from first */
                var time = moment(currentTime);
                var timestep = 0;
                if (time !== undefined) {
                    for (var i in timesteps) {
                        if (time.isSame(moment(timesteps[i]))) {
                            timestep = i+1;
                            if (timestep > timesteps.length-1) {
                                timestep = 0;
                            }
                            break;
                        }
                    }
                }
                return timestep;
            };
            var timestep = _startTime(this.wmsParams.time, this.timesteps);

            //NOT USED: var noRedraw = true;
            //NOT USED: var running = true;
            //NOT USED: var now = timesteps[timestep];
            //NOT USED: var that = this;
            var callback = function () {
                timestep += 1;
                if (timestep > timesteps.length-1) {
                    timestep = 0;
                }
                var strtime = moment(timesteps[timestep]);
                strtime = strtime.format('YYYY-MM-DDTHH:mm:ss.SSS') + 'Z';
                //NOT USED: var params = {'time': strtime};
                //'time' and 'i' NOT DEFINED: if (! time.isSame(moment(timesteps[i]))) {
                //    console.log(params);
                //    that.prefetch(params);
                //}
            };
            var strtime = moment(timesteps[timestep]);
            strtime = strtime.format('YYYY-MM-DDTHH:mm:ss.SSS') + 'Z';
            var params = {'time': strtime};
            this.prefetch(params, callback);
        },
     
        // TODO: Not yet functional
        abortPrefetch: function () {
            /* Abort prefetching. */
            this._cacheLayer.on('load', function () {}, this);
        },

        /*
         * Override getTileUrl when requesting data outside 
         * time range. When outside we return a data url 
         * containing a blank transparent image.
         */
        getTileUrl: function (coords) {
            var url;
            // Check if within time range
            var load_tile = true;
            function parseDecimalInt(s) {
                    return parseInt(s, 10);
            }
            var stime = this.wmsParams.time;
            // wmsParams.time might not yet be initialized.
            // In that case we just request the image even
            // if it is out of time range
            if (stime !== undefined) {
                if (stime !== 'current') {
                    var sptime = stime.split('T');
                    if (sptime.length == 2) {
                        var date = sptime[0].split('-').map(parseDecimalInt);
                        var time = sptime[1].split(':').map(parseDecimalInt);
                        var timestep = new Date(Date.UTC(date[0], date[1]-1, date[2],
                                                 time[0], time[1], time[2]));
                        var timesteps = this.timesteps;
                        if (timesteps !== null && (timestep < timesteps[0] ||
                            timestep > timesteps[timesteps.length-1])) {
                            load_tile = false;
                        }
                    }
                }
            }

            if (load_tile) {
                url = L.TileLayer.WMS.prototype.getTileUrl.call(this, coords);
            } else {
                //url = L.Util.emptyImageUrl;
                // Seems like some browsers do not like the emptyImageUrl so
                // we use our own empty image
                url = protocol + '//tiles.fcoo.dk/tiles/empty_512.png';
                this._removeAllTiles();
            }
            return url;
        },

        _error_metadata: function(jqXHR, textStatus/*, err*/) {
            var msg = 'Failed getting web map metadata from ' + jqXHR.url +
                      ' due to ' + textStatus;
            this.options.onMetadataError(new MetadataError(msg));
        },

        _got_metadata: function(json/*, textStatus, jqXHR*/) {
            try {
                if ('epoch' in json) {
                    this._epoch = moment(json.epoch);
                }
                if ('last_modified' in json) {
                    this._last_modified = moment(json.last_modified);
                }
                var varname = this.wmsParams.layers.split(':')[0].split(',')[0];
                if (! (varname in json)) {
                    throw new MetadataError('Cannot find ' + varname + ' in ' + json);
                }
                var variable = json[varname];
                
                this._long_name = variable.long_name;
                this._units = variable.units;
                if ('levels' in variable) {
                    this.levels = variable.levels;
                }
                // Extract bounds for this variable
                if ('bounds' in variable) {
                    var bounds = variable.bounds;
                    bounds[0] = (bounds[0] > 180.0) ? bounds[0] - 360.0 : bounds[0];
                    bounds[2] = (bounds[2] > 180.0) ? bounds[2] - 360.0 : bounds[2];
                    this.options.bounds =  L.latLngBounds(
                                             L.latLng(bounds[1], bounds[0]), 
                                             L.latLng(bounds[3], bounds[2]));
                }
                if ('time' in variable) {
                    // Make array of timesteps for this layer
                    var parseDecimalInt = function (s) {
                        return parseInt(s, 10);
                    };
                    var extent = variable.time;
                    var timesteps = [];
                    for (var i=0; i<extent.length; i++) {
                        var dt = extent[i].split('T');
                        var d = dt[0].split('-').map(parseDecimalInt);
                        var t = dt[1].split(':').map(parseDecimalInt);
                        var currentdate = new Date(Date.UTC(d[0], d[1]-1, d[2], t[0], t[1], t[2]));
                        timesteps[i] = new Date(currentdate);
                    }
                    this.timesteps = timesteps;
                }
                this._gotMetadata = true;
            } catch (err) {
                this.options.onMetadataError(new MetadataError(err.message));
            }
        },

        getLegendUrl: function() {
            var params = {
                request: this.legendParams.request,
                styles: this.legendParams.styles,
                cmap: this.legendParams.cmap
            };
            var url = L.Util.getParamString(params);
            return url;
        },

        onAdd: function(map) {
            var that = this;
            this._map = map;

            // Subscribe to datetime updates
            map.on('datetimechange', this.setParamsListener, this);

            if (that.options.foreground !== null) {
                that.options.foreground.addTo(map);
            }

            var gotMetadata = function () {
                if (that._gotMetadata) {
                    // Add legend when required info available
                    if (that.legendParams.show) {
                        that._legendControl = that._getLegendControl();
                        if (that._legendControl !== null) {
                            //NOT USED: var legendId = that._legendId;
                            if (that.legendParams.show) {
                                that.legendParams.imageUrl = that._fcootileurl + that.getLegendUrl();
                            }
                            if (that.legendParams.show && that.legendParams.imageUrl !== null) {
                                if (that.legendParams.longName === undefined) {
                                    that.legendParams.longName = that._long_name;
                                }
                                if (that.legendParams.units === undefined) {
                                    that.legendParams.units = that._units;
                                }
                                var legendOptions = {
                                    'imageUrl': that.legendParams.imageUrl,
                                    'attribution': that.legendParams.attribution,
                                    'lastUpdated': that._last_modified,
                                    'epoch': that._epoch,
                                    'updatesPerDay': that.legendParams.updatesPerDay,
                                    'longName': that.legendParams.longName,
                                    'units': that.legendParams.units
                                };
                                that._legendId = that._legendControl.addLegend(
                                                legendOptions);
                            }
                        }
                    }

                    // Subscribe to levelchange events for layers with level attribute
                    if (that.levels !== undefined) {
                        map.on('levelchange', function(evt) {
                            that.setParams({level: evt.index}, false, false);
                        });
                    }

                    // Check if time information is available and set current time
                    // to first time step if this is the case. Add layer to map
                    // after that
                    if (that.wmsParams.time === undefined) {
                        var strtime = moment(that.timesteps[0]);
                        strtime = strtime.format('YYYY-MM-DDTHH:mm:ss.SSS') + 'Z';
                        that.wmsParams.time = strtime;
                    }
                    L.TileLayer.WMS.prototype.onAdd.call(that, map);
                } else {
                    setTimeout(gotMetadata, 10);
                }
            };
            gotMetadata();
        },

        onRemove: function(map) {
            if (this._legendControl !== null) {
                this._legendControl.removeLegend(this._legendId);
                this._legendControl = null;
                this._legendId = null;
            }
            if (this.options.foreground !== null) {
                this.options.foreground.removeFrom(map);
            }

            // Unsubscribe to datetime updates
            map.off('datetimechange', this.setParamsListener, this);

            // Unsubscribe to levelchange events for layers with level attribute
            if (this.levels !== undefined) {
                map.off('levelchange', this);
            }

            this._map = null;
            L.TileLayer.WMS.prototype.onRemove.call(this, map);
        },

        _getLegendControl: function() {
            if (typeof this._map._fcoo_legendcontrol == 'undefined' || !this._map._fcoo_legendcontrol) {
                this._map._fcoo_legendcontrol = new L.Control.Legend(
                        {position: this.legendParams.position,
                        language: this.options.language});
                this._map.addControl(this._map._fcoo_legendcontrol);
            }
            return this._map._fcoo_legendcontrol;
        }
    });


}(jQuery, L, this, document));



;/****************************************************************************
	wms-ajax-proxy.js, 

	(c) 2015, FCOO

	https://github.com/FCOO/leaflet-tilelayer-wms-pydap
	https://github.com/FCOO

****************************************************************************/
;(function ($, window, document, undefined) {
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
