(function (){
    "use strict";
    /*jslint browser: true*/
    /*global $, L, console*/

    /**
     * A JavaScript library for using Web Map Service layers from pydap
     * without hassle.
     */
    L.TileLayer.WMS.Pydap = L.TileLayer.WMS.extend({
        //baseUrl: location.protocol + "//{s}.fcoo.dk/webmap-staging/{dataset}.wms",
        baseUrl: location.protocol + "//{s}.fcoo.dk/webmap/{dataset}.wms",
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
            subdomains: ['api01', 'api02', 'api03', 'api04'],
            maxZoom: 18,
            primadonna: true,
            foreground: null,
            crs: L.CRS.EPSG3857,
            attribution: 'Weather from <a href="http://fcoo.dk/" alt="Danish Defence METOC Forecast Service">FCOO</a>'
        },

        initialize: function (dataset, wmsParams, legendParams, options) {
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
            var ajaxOptions = {
              url: this._fcootileurl,
              data: {
                      SERVICE: 'WMS',
                      REQUEST: 'GetMetadata',
                      VERSION: this.wmsParams.version,
                      ITEMS: 'epoch,last_modified,long_name,units,bounds,time,levels',
                      LAYERS: this.wmsParams.layers.split(':')[0].split(',')[0],
                    },
              context: this,
              error: this._error_metadata,
              success: this._got_metadata,
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
                this.options.ajaxProxy.deferredAjax(ajaxOptions);
            } else {
                $.ajax(ajaxOptions);
            }
        },

        setParamsListener: function (evt) {
            this.setParams({time: evt.datetime}, false, true);
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
            return coords.x + ':' + coords.y + ':' + coords.z + ':' + this.wmsParams.time;
        },

        // TODO: Not yet functional
        prefetch: function (params, callback) {
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

            var noRedraw = true;
            var running = true;
            var now = timesteps[timestep];
            var that = this;
            var callback = function () {
                timestep += 1;
                if (timestep > timesteps.length-1) {
                    timestep = 0;
                }
                var strtime = moment(timesteps[timestep]);
                strtime = strtime.format('YYYY-MM-DDTHH:mm:ss.SSS') + 'Z';
                var params = {'time': strtime};
                if (! time.isSame(moment(timesteps[i]))) {
                    console.log(params);
                    that.prefetch(params);
                }
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

            if (load_tile) {
                url = L.TileLayer.WMS.prototype.getTileUrl.call(this, coords);
            } else {
                //url = L.Util.emptyImageUrl;
                // Seems like some browsers do not like the emptyImageUrl so
                // we use our own empty image
                url = location.protocol + '//tiles.fcoo.dk/tiles/empty_512.png';
                this._removeAllTiles();
            }
            return url;
        },

        _error_metadata: function(jqXHR, textStatus, err) {
            var msg = 'Failed getting web map metadata from ' + jqXHR.url;
            var n = noty({text: msg, type: "error"});
            throw new Error(msg);
        },

        _got_metadata: function(json, textStatus, jqXHR) {
            try {
                if ('epoch' in json) {
                    this._epoch = moment(json.epoch);
                }
                if ('last_modified' in json) {
                    this._last_modified = moment(json.last_modified);
                }
                var variable = json[this.wmsParams.layers.split(':')[0].split(',')[0]];
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
                //console.log(err);
                var n = noty({text: err.message, type: "error"});
                throw err;
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
                            var legendId = that._legendId;
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
                    if (that.wmsParams.time == undefined) {
                        var strtime = moment(that.timesteps[0]);
                        strtime = strtime.format('YYYY-MM-DDTHH:mm:ss.SSS') + 'Z';
                        that.wmsParams.time = strtime;
                    }
                    L.TileLayer.WMS.prototype.onAdd.call(that, map);
                } else {
                    setTimeout(gotMetadata, 10);
                }
            }
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

})();
