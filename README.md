# leaflet-tilelayer-wms-pydap

Extension of the L.TileLayer.WMS to include a legend and easy support for 
WMS time requests for weather forecasts served using the pydap WMS server.
Currently it supports the extended version of the pydap WMS response which
is hosted here:

https://github.com/jblarsen/pydap.responses.wms

## Demos
http://jblarsen.github.io/leaflet-tilelayer-wms-pydap/examples/example_pressure.html

http://jblarsen.github.io/leaflet-tilelayer-wms-pydap/examples/example_seastate.html

http://jblarsen.github.io/leaflet-tilelayer-wms-pydap/examples/example_simple.html

http://jblarsen.github.io/leaflet-tilelayer-wms-pydap/examples/example_vectors.html

## Requirements
Leaflet, jQuery, jQuery UI and moment.

http://leafletjs.com/

http://jquery.com/

http://momentjs.com/

## Usage
Install the dependencies and include the Javascript
file in this repository in your application:

Example usage:

        var dataset = 'DMI/HIRLAM/MAPS_DMI_S03_v005C.nc';
        var options = {
            tileSize: 512,
            attribution: 'Wind forecasts from <a href="http://dmi.dk" alt="Danish Meteorological Institute">DMI</a>',
        }
        var optionsWindspeed = {
            layers: 'windspeed',
            opacity: 0.6,
            zIndex: 100
        };
        optionsWindspeed = $.extend(optionsWindspeed, options);
        var legendOptionsWindspeed = {
            cmap: 'Wind_ms_YRP_11colors',
            attribution: '<a href="dmi.dk">DMI</a>'
        };
        var optionsWinddirection = {
            layers: 'UGRD:VGRD',
            opacity: 1.0,
            zIndex: 200,
            styles: 'vector_method=black_arrowbarbs'
        }
        optionsWinddirection = $.extend(optionsWinddirection, options);

        var windspeed = new L.TileLayer.WMS.Pydap(dataset, optionsWindspeed, 
                    legendOptionsWindspeed);
        var winddirection = new L.TileLayer.WMS.Pydap(dataset,
                    optionsWinddirection);
        map.addLayer(windspeed);
        map.addLayer(winddirection);


