# leaflet-tilelayer-wms-pydap
>


## Description
Extension of the L.TileLayer.WMS to include a legend and easy support for WMS time requests for weather forecasts served using the pydap WMS server.

## Installation
### bower
`bower install https://github.com/FCOO/leaflet-tilelayer-wms-pydap.git --save`

## Demo
http://fcoo.github.io/leaflet-tilelayer-wms-pydap/demo/ 

## Usage

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




### options


### Methods


## Copyright and License
This plugin is licensed under the [MIT license](https://github.com/FCOO/leaflet-tilelayer-wms-pydap/LICENSE).

Copyright (c) 2015 [FCOO](https://github.com/FCOO)

## Contact information

Jesper Larsen jla@fcoo.dk


## Credits and acknowledgements


## Known bugs

## Troubleshooting

## Changelog



