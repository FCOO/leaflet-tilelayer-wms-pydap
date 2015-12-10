# leaflet-tilelayer-counting
Leaflet TileLayer (L.TileLayer) which keeps track of how many times the user adds and removes it from the map. It is only added once and is not removed until it has been removed from the map the same number of times it has been added.

## Demo
http://jblarsen.github.io/leaflet-tilelayer-counting/

## Requirements
You simply need Leaflet

http://leafletjs.com/

## Usage
Example usage:

        var layer = new L.TileLayer.Counting('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors</a>'
        });
        layer.addTo(map);
        // Do some stuff...
        layer.addTo(map);
