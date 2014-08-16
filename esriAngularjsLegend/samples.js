setDynamicMapService = function (map) {
    require([
       "esri/layers/ArcGISDynamicMapServiceLayer", "dojo/domReady!"
    ], function (ArcGISDynamicMapServiceLayer) {
        var layer = new ArcGISDynamicMapServiceLayer("http://sampleserver1.arcgisonline.com/ArcGIS/rest/services/Specialty/ESRI_StateCityHighway_USA/MapServer", { id: "dynamicLayer" });
        layer.on('load', function(args){
            map.setExtent(args.layer.fullExtent, true);
        });
        map.addLayer(layer);
    });
}

setGraphicsLayer = function (map) {
    require([
    "esri/geometry/Point", "esri/geometry/Polygon",
    "esri/symbols/SimpleMarkerSymbol", "esri/symbols/SimpleLineSymbol",
    "esri/symbols/SimpleFillSymbol","esri/Color",
    "esri/graphic",  "dojo/parser",
     "esri/layers/GraphicsLayer", "esri/graphicsUtils",
    "dojo/domReady!"
    ], function (
    Point, Polygon,
    SimpleMarkerSymbol, SimpleLineSymbol,
    SimpleFillSymbol, Color,
    Graphic, parser,
    GraphicsLayer, graphicsUtils
  ) {
        parser.parse();

        // Adds pre-defined geometries to map
        var polygonSymbol = new SimpleFillSymbol(
          SimpleFillSymbol.STYLE_SOLID,
          new SimpleLineSymbol(
            SimpleLineSymbol.STYLE_DOT,
            new Color([151, 249, 0, .80]),
            3
          ),
          new Color([151, 249, 0, 0.45])
        );

        var polygonSymbol1 = new SimpleFillSymbol(
          SimpleFillSymbol.STYLE_SOLID,
          new SimpleLineSymbol(
            SimpleLineSymbol.STYLE_SHORTDASH,
            new Color([155, 155, 0, .80]),
            3
          ),
          new Color([255, 255, 0, 0.45])
        );

        var polygonSymbol2 = new SimpleFillSymbol(
          SimpleFillSymbol.STYLE_SOLID,
          new SimpleLineSymbol(
            SimpleLineSymbol.STYLE_DOT,
            new Color([0, 0, 255, .80]),
            3
          ),
          new Color([0, 215, 255, 0.45])
        );

        var simplePictureMarkerSymbol = new esri.symbol.PictureMarkerSymbol('http://images.clipartpanda.com/snake-clipart-snake-clip-art-1.gif', 26, 26);
        
        var polygon = new Polygon({
            "rings": [
              [
                [-4226661.916056009, 8496372.808143634],
                [-3835304.3312360067, 8731187.359035634],
                [-2269873.991956003, 9005137.668409634],
                [-1213208.5129420012, 8613780.083589634],
                [-1017529.7205320001, 8065879.464841632],
                [-1213208.5129420012, 7478843.087611631],
                [-2230738.233474003, 6891806.710381631],
                [-2935181.8861500043, 6735263.6764536295],
                [-3522218.263380006, 6891806.710381631],
                [-3952711.606682008, 7165757.01975563],
                [-4265797.674538009, 7283164.295201631],
                [-4304933.433020009, 7635386.121539632],
                [-4304933.433020009, 7674521.880021632],
                [-4226661.916056009, 8496372.808143634]
              ]
            ],
            "spatialReference": {
                "wkid": 102100
            }
        });
        var arrow = new Polygon({
            "rings": [
              [
                [9862211.137464028, 6617856.40100763],
                [8922952.933896024, 5522055.163511626],
                [8922952.933896024, 5991684.265295628],
                [6105178.323192019, 5991684.265295628],
                [6105178.323192019, 7087485.50279163],
                [8922952.933896024, 7087485.50279163],
                [8922952.933896024, 7557114.604575632],
                [9862211.137464028, 6617856.40100763]
              ]
            ],
            "spatialReference": {
                "wkid": 102100
            }
        });

        var triangle = new Polygon({
            "rings": [
              [
                [2426417.02588401, 8535508.566625634],
                [4304933.433020014, 12292541.380897645],
                [6183449.840156019, 8535508.566625634],
                [2426417.02588401, 8535508.566625634]
              ]
            ],
            "spatialReference": {
                "wkid": 102100
            }
        });
        var graphicsLayer = new GraphicsLayer();
        graphicsLayer.id = "graphcisLayerTest";
        graphicsLayer.name = "Graphics Layer Test";
        graphicsLayer.add(new Graphic(polygon, polygonSymbol));
        graphicsLayer.add(new Graphic(arrow, polygonSymbol1));
        graphicsLayer.add(new Graphic(triangle, polygonSymbol2));
      
        
        map.addLayer(graphicsLayer);

        //testing to ensure added graphics get added to the legend
        setTimeout(function () {
            graphicsLayer.add(new Graphic(new Point(0, 0), simplePictureMarkerSymbol));
            map.setExtent(graphicsUtils.graphicsExtent(graphicsLayer.graphics), true);
        }, 3000)
    })
}

setColorRamp = function (map) {
    require([
  "esri/map", "esri/layers/FeatureLayer", "esri/dijit/Legend",
  "esri/renderers/SimpleRenderer", "esri/symbols/SimpleMarkerSymbol",
  "esri/Color", "dojo/_base/array", "dojo/parser", "esri/InfoTemplate", "esri/renderers/ClassBreaksRenderer",
  "esri/layers/LabelLayer", "esri/symbols/TextSymbol", "esri/symbols/Font", "esri/symbols/SimpleLineSymbol",
  "dijit/layout/BorderContainer", "dijit/layout/ContentPane",
  "dojo/domReady!"
    ], function (
  Map, FeatureLayer, Legend, SimpleRenderer, SimpleMarkerSymbol,
  Color, arrayUtils, parser, InfoTemplate, ClassBreaksRenderer, LabelLayer, TextSymbol, Font, SimpleLineSymbol
) {
        parser.parse();
        var layer = new FeatureLayer("http://tmservices1.esri.com/arcgis/rest/services/LiveFeeds/NOAA_METAR_current_wind_speed_direction/MapServer/0", {
            mode: FeatureLayer.MODE_ONDEMAND,
            outFields: ["*"],
            infoTemplate: new InfoTemplate("${STATION_NAME}, ${COUNTRY}", "<table><tr><td>Temperature</td><td>${TEMP}F</td></tr><tr><td>Dew point</td><td>${DEW_POINT}</td></tr><tr><td>Relative humidity</td><td>${R_HUMIDITY}</td></tr><tr><td>Wind</td><td>from ${WIND_DIRECT} degrees at ${WIND_SPEED}mph</td></tr><tr><td>Visibility</td><td>${VISIBILITY}</td></tr><tr><td>Pressure</td><td>${PRESSURE}mb</td></tr><tr><td>Coulds</td><td>${SKY_CONDTN}</td></tr><tr><td>Weather</td><td>${WEATHER}</td></tr><tr><td>Heat index</td><td>${HEAT_INDEX}</td></tr></table><hr><i>${UTC_DATETIME}</i>")
        });
        map.addLayers([layer]);

        var marker = new SimpleMarkerSymbol().setPath("M14.5,29 23.5,0 14.5,9 5.5,0z").setOutline(new SimpleLineSymbol().setWidth(0.5));
        var renderer = new SimpleRenderer(marker);

        renderer.setRotationInfo({
            field: "WIND_DIRECT"
        });
        renderer.setProportionalSymbolInfo({
            field: "WIND_SPEED",
            minDataValue: 5,
            minSize: 6,
            maxDataValue: 50,
            maxSize: 25,
            
           
            valueUnit: "unknown"
        });
        renderer.setColorInfo({
            field: "TEMP",
            minDataValue: -20,
            maxDataValue: 130,
            colors: [
              new Color([0, 104, 214]), new Color([20, 120, 220]), new Color([39, 136, 226]),
              new Color([59, 152, 232]), new Color([78, 169, 237]), new Color([98, 185, 243]),
              new Color([131, 197, 181]), new Color([164, 210, 120]), new Color([197, 222, 58]),
              new Color([205, 188, 80]), new Color([212, 155, 102]), new Color([220, 121, 124]),
              new Color([216, 87, 115]), new Color([211, 53, 106]), new Color([206, 19, 97])
            ]
        });
        layer.setRenderer(renderer);

        ////add the legend
        //map.on("layers-add-result", function (evt) {
        //    var layerInfo = arrayUtils.map(evt.layers, function (layer, index) {
        //        return { layer: layer.layer, title: "Temperature (F)" };
        //    });
        //    if (layerInfo.length > 0) {
        //        var legendDijit = new Legend({
        //            map: map,
        //            layerInfos: layerInfo
        //        }, "legend");
        //        legendDijit.startup();
        //    }
        //});
    });
}
setUniqueValueRenderer = function (map) {
    require([
  "esri/map", "esri/layers/FeatureLayer", "esri/InfoTemplate",
  "esri/symbols/SimpleLineSymbol", "esri/symbols/SimpleFillSymbol",
  "esri/renderers/UniqueValueRenderer", "esri/Color",
  "dojo/domReady!"
    ], function (
  Map, FeatureLayer, InfoTemplate,
  SimpleLineSymbol, SimpleFillSymbol,
  UniqueValueRenderer, Color
) {
        var defaultSymbol = new SimpleFillSymbol().setStyle(SimpleFillSymbol.STYLE_NULL);
        defaultSymbol.outline.setStyle(SimpleLineSymbol.STYLE_NULL);

        //create renderer
        var renderer = new UniqueValueRenderer(defaultSymbol, "SUB_REGION");

        //add symbol for each possible value
        renderer.addValue("Pacific", new SimpleFillSymbol().setColor(new Color([255, 0, 0, 0.5])));
        renderer.addValue("Mtn", new SimpleFillSymbol().setColor(new Color([0, 255, 0, 0.5])));
        renderer.addValue("N Eng", new SimpleFillSymbol().setColor(new Color([0, 0, 255, 0.5])));
        renderer.addValue("S Atl", new SimpleFillSymbol().setColor(new Color([255, 0, 255, 0.5])));
        renderer.addValue("Mid Atl", new SimpleFillSymbol().setColor(new Color([255, 255, 255, 0.75])));
        renderer.addValue("E N Cen", new SimpleFillSymbol().setColor(new Color([0, 255, 255, 0.5])));
        renderer.addValue("W N Cen", new SimpleFillSymbol().setColor(new Color([255, 255, 0, 0.5])));
        renderer.addValue("E S Cen", new SimpleFillSymbol().setColor(new Color([127, 127, 127, 0.5])));
        renderer.addValue("W S Cen", new SimpleFillSymbol().setColor(new Color([0, 0, 0, 0.5])));

        var featureLayer = new FeatureLayer("http://sampleserver1.arcgisonline.com/ArcGIS/rest/services/Specialty/ESRI_StateCityHighway_USA/MapServer/1", {
            mode: FeatureLayer.MODE_ONDEMAND,
            outFields: ["SUB_REGION"],
        });
        featureLayer.name = "UniqueValue Renderer"

        featureLayer.setRenderer(renderer);
        featureLayer.on('load', function (args) {
            map.setExtent(args.layer.fullExtent, true);
        });
        map.addLayer(featureLayer);

    });
}

setClassBreakRenderer = function (map) {
    require([
        "esri/map", "esri/layers/FeatureLayer",
        "esri/InfoTemplate", "esri/symbols/SimpleFillSymbol",
        "esri/renderers/ClassBreaksRenderer",
        "esri/Color", "esri/graphicsUtils", "dojo/dom-style", "dojo/domReady!"
    ], function (
        Map, FeatureLayer,
        InfoTemplate, SimpleFillSymbol,
        ClassBreaksRenderer,
        Color, graphicsUtils, domStyle
      ) {
        var symbol = new SimpleFillSymbol();
        symbol.setColor(new Color([150, 150, 150, 0.5]));

        var renderer = new ClassBreaksRenderer(symbol, "POP07_SQMI");
        renderer.addBreak(0, 25, new SimpleFillSymbol().setColor(new Color([56, 168, 0, 0.5])));
        renderer.addBreak(25, 75, new SimpleFillSymbol().setColor(new Color([139, 209, 0, 0.5])));
        renderer.addBreak(75, 175, new SimpleFillSymbol().setColor(new Color([255, 255, 0, 0.5])));
        renderer.addBreak(175, 400, new SimpleFillSymbol().setColor(new Color([255, 128, 0, 0.5])));
        renderer.addBreak(400, Infinity, new SimpleFillSymbol().setColor(new Color([255, 0, 0, 0.5])));

        var featureLayer = new esri.layers.FeatureLayer("http://sampleserver1.arcgisonline.com/ArcGIS/rest/services/Demographics/ESRI_Census_USA/MapServer/3", {
            mode: FeatureLayer.MODE_SNAPSHOT,
            outFields: ["*"],
        });

        featureLayer.setDefinitionExpression("STATE_NAME = 'Missouri'");
        featureLayer.setRenderer(renderer);
        featureLayer.on('update-end', function (args) {
            map.setExtent(graphicsUtils.graphicsExtent(featureLayer.graphics), true);
        });
        map.addLayer(featureLayer);

    });
}