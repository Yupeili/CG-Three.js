var webglExists = (function () {
    try {
        var canvas = document.createElement('canvas');
        return !!window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch (e) {
        return false;
    }
})(); // jscs:ignore

if (!webglExists) {
    alert('Your browser does not appear to support WebGL. You can try viewing this page anyway, but it may be slow and some things may not look as intended. Please try viewing on desktop Firefox or Chrome.');
}

// Workaround: in Chrome, if a page is opened with window.open(),
// window.innerWidth and window.innerHeight will be zero.
if (window.innerWidth === 0) {
    window.innerWidth = parent.innerWidth;
    window.innerHeight = parent.innerHeight;
}

var camera, scene, renderer, clock, player, terrainScene, decoScene, lastOptions, controls = {}, fpsCamera, skyDome,
    skyLight, sand, water; // jscs:ignore requireLineBreakAfterVariableAssignment
var INV_MAX_FPS = 1 / 100,
    frameDelta = 0,
    paused = true,
    mouseX = 0,
    mouseY = 0,
    useFPS = false;
// ratcasting
var raycaster = new THREE.Raycaster();
var mouse = new THREE.Vector2();
var treemeshs = [];
var baseColor = 0x2d4c1e;
var intersectColor = 0x00D66B;
var lastSelected;
var currentSelected;
var currentIntersected;
var lastIntersected;
var lastModelScene;
var helper;
var sphereMesh;

function setupThreeJS() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x868293, 0.0007);

    renderer = webglExists ? new THREE.WebGLRenderer({antialias: true}) : new THREE.CanvasRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('tabindex', -1);

    camera = new THREE.PerspectiveCamera(60, renderer.domElement.width / renderer.domElement.height, 1, 10000);
    scene.add(camera);
    camera.position.x = 449;
    camera.position.y = 311;
    camera.position.z = 376;
    camera.rotation.x = -52 * Math.PI / 180;
    camera.rotation.y = 35 * Math.PI / 180;
    camera.rotation.z = 37 * Math.PI / 180;
    renderer.domElement.addEventListener('mousemove', onDocumentMouseMove, false);
    renderer.domElement.addEventListener('click', onDocumentMouseClick, false);
    clock = new THREE.Clock(false);

    var sphereGeo = new THREE.SphereGeometry(20);
    var sphereMat = new THREE.MeshBasicMaterial();
    sphereMat.color = new THREE.Color(1, 0, 0);
    sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(sphereMesh);

}

function setupWorld() {
    new THREE.TextureLoader().load('img/sky1.jpg', function (t1) {
        t1.minFilter = THREE.LinearFilter; // Texture is not a power-of-two size; use smoother interpolation.
        skyDome = new THREE.Mesh(
            new THREE.SphereGeometry(8192, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
            new THREE.MeshBasicMaterial({map: t1, side: THREE.BackSide, fog: false})
        );
        skyDome.position.y = -99;
        scene.add(skyDome);
    });

    water = new THREE.Mesh(
        new THREE.PlaneBufferGeometry(16384 + 1024, 16384 + 1024, 16, 16),
        new THREE.MeshLambertMaterial({color: 0x006ba0, transparent: true, opacity: 0.6})
    );
    water.position.y = -99;
    water.rotation.x = -0.5 * Math.PI;
    scene.add(water);

    skyLight = new THREE.DirectionalLight(0xe8bdb0, 1.5);
    skyLight.position.set(2950, 2625, -160); // Sun on the sky texture
    scene.add(skyLight);
    var light = new THREE.DirectionalLight(0xc3eaff, 0.75);
    light.position.set(-1, -0.5, -1);
    scene.add(light);
}

function setupDatGui() {
    var heightmapImage = new Image();
    heightmapImage.src = 'img/heightmap.png';

    function Settings() {
        var that = this;
        var mat = new THREE.MeshBasicMaterial({color: 0x5566aa, wireframe: true});
        var gray = new THREE.MeshPhongMaterial({color: 0x88aaaa, specular: 0x444455, shininess: 10});
        var blend;
        var elevationGraph = document.getElementById('elevation-graph'),
            slopeGraph = document.getElementById('slope-graph'),
            analyticsValues = document.getElementsByClassName('value');
        var loader = new THREE.TextureLoader();
        loader.load('img/sand1.jpg', function (t1) {
            t1.wrapS = t1.wrapT = THREE.RepeatWrapping;
            sand = new THREE.Mesh(
                new THREE.PlaneBufferGeometry(16384 + 1024, 16384 + 1024, 64, 64),
                new THREE.MeshLambertMaterial({map: t1})
            );
            sand.position.y = -101;
            sand.rotation.x = -0.5 * Math.PI;
            scene.add(sand);
            loader.load('img/grass1.jpg', function (t2) {
                loader.load('img/stone1.jpg', function (t3) {
                    loader.load('img/snow1.jpg', function (t4) {
                        // t2.repeat.x = t2.repeat.y = 2;
                        blend = THREE.Terrain.generateBlendedMaterial([
                            {texture: t1},
                            {texture: t2, levels: [-80, -35, 20, 50]},
                            {texture: t3, levels: [20, 50, 60, 85]},
                            {
                                texture: t4,
                                glsl: '1.0 - smoothstep(65.0 + smoothstep(-256.0, 256.0, vPosition.x) * 10.0, 80.0, vPosition.z)'
                            },
                            {
                                texture: t3,
                                glsl: 'slope > 0.7853981633974483 ? 0.2 : 1.0 - smoothstep(0.47123889803846897, 0.7853981633974483, slope) + 0.2'
                            }, // between 27 and 45 degrees
                        ]);
                        that.Regenerate();
                    });
                });
            });
        });
        this.easing = 'Linear';
        this.heightmap = 'PerlinDiamond';
        this.smoothing = 'None';
        this.maxHeight = 200;
        this.segments = webglExists ? 63 : 31;
        this.steps = 1;
        this.turbulent = false;
        this.size = 1024;
        this.sky = true;
        this.texture = webglExists ? 'Blended' : 'Wireframe';
        this.edgeDirection = 'Normal';
        this.edgeType = 'Box';
        this.edgeDistance = 256;
        this.edgeCurve = 'EaseInOut';
        this['width:length ratio'] = 1.0;
        this['Flight mode'] = useFPS;
        this['Light color'] = '#' + skyLight.color.getHexString();
        this.spread = 60;
        this.scattering = 'PerlinAltitude';
        this.after = function (vertices, options) {
            if (that.edgeDirection !== 'Normal') {
                (that.edgeType === 'Box' ? THREE.Terrain.Edges : THREE.Terrain.RadialEdges)(
                    vertices,
                    options,
                    that.edgeDirection === 'Up' ? true : false,
                    that.edgeType === 'Box' ? that.edgeDistance : Math.min(options.xSize, options.ySize) * 0.5 - that.edgeDistance,
                    THREE.Terrain[that.edgeCurve]
                );
            }
        };
        window.rebuild = this.Regenerate = function () {
            var s = parseInt(that.segments, 10),
                h = that.heightmap === 'heightmap.png';
            var o = {
                after: that.after,
                easing: THREE.Terrain[that.easing],
                heightmap: h ? heightmapImage : (that.heightmap === 'influences' ? customInfluences : THREE.Terrain[that.heightmap]),
                material: that.texture == 'Wireframe' ? mat : (that.texture == 'Blended' ? blend : gray),
                maxHeight: that.maxHeight - 100,
                minHeight: -100,
                steps: that.steps,
                stretch: true,
                turbulent: that.turbulent,
                useBufferGeometry: false,
                xSize: that.size,
                ySize: Math.round(that.size * that['width:length ratio']),
                xSegments: s,
                ySegments: Math.round(s * that['width:length ratio']),
                _mesh: typeof terrainScene === 'undefined' ? null : terrainScene.children[0], // internal only
            };
            scene.remove(terrainScene);
            // delete tree from last scene
            for (var i = 0; i < treemeshs; i++) {
                treemeshs[i].geometry.dispose();
                treemeshs[i].material.dispose();
                scene.remove(treemeshs[i]);
            }
            treemeshs = [];
            terrainScene = THREE.Terrain(o);
            // applySmoothing(that.smoothing, o);
            scene.add(terrainScene);
            skyDome.visible = sand.visible = water.visible = that.texture != 'Wireframe';
            var he = document.getElementById('heightmap');
            if (he) {
                o.heightmap = he;
                THREE.Terrain.toHeightmap(terrainScene.children[0].geometry.vertices, o);
            }
            that['Scatter meshes']();
            lastOptions = o;

            // var analysis = THREE.Terrain.Analyze(terrainScene.children[0], o),
            //     deviations = getSummary(analysis),
            //     prop;
            // analysis.elevation.drawHistogram(elevationGraph, 10);
            // analysis.slope.drawHistogram(slopeGraph, 10);
            // for (var i = 0, l = analyticsValues.length; i < l; i++) {
            //     prop = analyticsValues[i].getAttribute('data-property').split('.');
            //     var analytic = analysis[prop[0]][prop[1]];
            //     if (analyticsValues[i].getAttribute('class').split(/\s+/).indexOf('percent') !== -1) {
            //         analytic *= 100;
            //     }
            //     analyticsValues[i].textContent = cleanAnalytic(analytic);
            // }
            // for (prop in deviations) {
            //     if (deviations.hasOwnProperty(prop)) {
            //         document.querySelector('.summary-value[data-property="' + prop + '"]').textContent = deviations[prop];
            //     }
            // }
        };

        function altitudeProbability(z) {
            if (z > -80 && z < -50) return THREE.Terrain.EaseInOut((z + 80) / (-50 + 80)) * that.spread * 0.002;
            else if (z > -50 && z < 20) return that.spread * 0.002;
            else if (z > 20 && z < 50) return THREE.Terrain.EaseInOut((z - 20) / (50 - 20)) * that.spread * 0.002;
            return 0;
        }

        this.altitudeSpread = function (v, k) {
            return k % 4 === 0 && Math.random() < altitudeProbability(v.z);
        };
        var mesh = buildTree();
        var decoMat = mesh.material.map(
            function (mat) {
                return mat.clone();
            }); // new THREE.MeshBasicMaterial({color: 0x229966, wireframe: true});
        decoMat[0].wireframe = true;
        decoMat[1].wireframe = true;
        this['Scatter meshes'] = function () {
            var s = parseInt(that.segments, 10),
                spread,
                randomness;
            var o = {
                xSegments: s,
                ySegments: Math.round(s * that['width:length ratio']),
            };
            if (that.scattering === 'Linear') {
                spread = that.spread * 0.0005;
                randomness = Math.random;
            }
            else if (that.scattering === 'Altitude') {
                spread = that.altitudeSpread;
            }
            else if (that.scattering === 'PerlinAltitude') {
                spread = (function () {
                    var h = THREE.Terrain.ScatterHelper(THREE.Terrain.Perlin, o, 2, 0.125)(),
                        hs = THREE.Terrain.InEaseOut(that.spread * 0.01);
                    return function (v, k) {
                        var rv = h[k],
                            place = false;
                        if (rv < hs) {
                            place = true;
                        }
                        else if (rv < hs + 0.2) {
                            place = THREE.Terrain.EaseInOut((rv - hs) * 5) * hs < Math.random();
                        }
                        return Math.random() < altitudeProbability(v.z) * 5 && place;
                    };
                })();
            }
            else {
                spread = THREE.Terrain.InEaseOut(that.spread * 0.01) * (that.scattering === 'Worley' ? 1 : 0.5);
                randomness = THREE.Terrain.ScatterHelper(THREE.Terrain[that.scattering], o, 2, 0.125);
            }
            var geo = terrainScene.children[0].geometry;
            geo.computeFaceNormals();
            terrainScene.remove(decoScene);
            decoScene = scatterMeshes(geo, {
                mesh: mesh,
                w: s,
                h: Math.round(s * that['width:length ratio']),
                spread: spread,
                smoothSpread: that.scattering === 'Linear' ? 0 : 0.2,
                randomness: randomness,
                maxSlope: 0.6283185307179586, // 36deg or 36 / 180 * Math.PI, about the angle of repose of earth
                maxTilt: 0.15707963267948966, //  9deg or  9 / 180 * Math.PI. Trees grow up regardless of slope but we can allow a small variation
            });
            if (decoScene) {
                if (that.texture == 'Wireframe') {
                    decoScene.children[0].material = decoMat;
                }
                else if (that.texture == 'Grayscale') {
                    decoScene.children[0].material = gray;
                }
                terrainScene.add(decoScene);
            }
        };
    }

    var gui = new dat.GUI();
    var settings = new Settings();
    var heightmapFolder = gui.addFolder('Heightmap');
    heightmapFolder.add(settings, 'heightmap', ['Brownian', 'Cosine', 'CosineLayers', 'DiamondSquare', 'Fault', 'heightmap.png', 'Hill', 'HillIsland', 'influences', 'Particles', 'Perlin', 'PerlinDiamond', 'PerlinLayers', 'Simplex', 'SimplexLayers', 'Value', 'Weierstrass', 'Worley']).onFinishChange(settings.Regenerate);
    heightmapFolder.add(settings, 'easing', ['Linear', 'EaseIn', 'EaseInWeak', 'EaseOut', 'EaseInOut', 'InEaseOut']).onFinishChange(settings.Regenerate);
    heightmapFolder.add(settings, 'smoothing', ['Conservative (0.5)', 'Conservative (1)', 'Conservative (10)', 'Gaussian (0.5, 7)', 'Gaussian (1.0, 7)', 'Gaussian (1.5, 7)', 'Gaussian (1.0, 5)', 'Gaussian (1.0, 11)', 'GaussianBox', 'Mean (0)', 'Mean (1)', 'Mean (8)', 'Median', 'None']).onChange(function (val) {
        applySmoothing(val, lastOptions);
        settings['Scatter meshes']();
        if (lastOptions.heightmap) {
            THREE.Terrain.toHeightmap(terrainScene.children[0].geometry.vertices, lastOptions);
        }
    });
    heightmapFolder.add(settings, 'segments', 7, 127).step(1).onFinishChange(settings.Regenerate);
    heightmapFolder.add(settings, 'steps', 1, 8).step(1).onFinishChange(settings.Regenerate);
    heightmapFolder.add(settings, 'turbulent').onFinishChange(settings.Regenerate);
    heightmapFolder.open();
    var decoFolder = gui.addFolder('Decoration');
    decoFolder.add(settings, 'texture', ['Blended', 'Grayscale', 'Wireframe']).onFinishChange(settings.Regenerate);
    decoFolder.add(settings, 'scattering', ['Altitude', 'Linear', 'Cosine', 'CosineLayers', 'DiamondSquare', 'Particles', 'Perlin', 'PerlinAltitude', 'Simplex', 'Value', 'Weierstrass', 'Worley']).onFinishChange(settings['Scatter meshes']);
    decoFolder.add(settings, 'spread', 0, 100).step(1).onFinishChange(settings['Scatter meshes']);
    decoFolder.addColor(settings, 'Light color').onChange(function (val) {
        skyLight.color.set(val);
    });
    var sizeFolder = gui.addFolder('Size');
    sizeFolder.add(settings, 'size', 1024, 3072).step(256).onFinishChange(settings.Regenerate);
    sizeFolder.add(settings, 'maxHeight', 2, 300).step(2).onFinishChange(settings.Regenerate);
    sizeFolder.add(settings, 'width:length ratio', 0.2, 2).step(0.05).onFinishChange(settings.Regenerate);
    var edgesFolder = gui.addFolder('Edges');
    edgesFolder.add(settings, 'edgeType', ['Box', 'Radial']).onFinishChange(settings.Regenerate);
    edgesFolder.add(settings, 'edgeDirection', ['Normal', 'Up', 'Down']).onFinishChange(settings.Regenerate);
    edgesFolder.add(settings, 'edgeCurve', ['Linear', 'EaseIn', 'EaseOut', 'EaseInOut']).onFinishChange(settings.Regenerate);
    edgesFolder.add(settings, 'edgeDistance', 0, 512).step(32).onFinishChange(settings.Regenerate);
    // gui.add(settings, 'Flight mode').onChange(function (val) {
    //     useFPS = val;
    //     fpsCamera.position.x = 449;
    //     fpsCamera.position.y = 311;
    //     fpsCamera.position.z = 376;
    //     controls.lat = -41;
    //     controls.lon = -139;
    //     controls.update(0);
    //     controls.freeze = true;
    //     if (useFPS) {
    //         document.getElementById('fpscontrols').className = 'visible';
    //         setTimeout(function () {
    //             controls.freeze = false;
    //         }, 1000);
    //     }
    //     else {
    //         document.getElementById('fpscontrols').className = '';
    //     }
    // });
    gui.add(settings, 'Scatter meshes');
    gui.add(settings, 'Regenerate');

    // if (typeof window.Stats !== 'undefined' && /[?&]stats=1\b/g.test(location.search)) {
    //     stats = new Stats();
    //     stats.setMode(0);
    //     stats.domElement.style.position = 'absolute';
    //     stats.domElement.style.left = '20px';
    //     stats.domElement.style.bottom = '0px';
    //     document.body.appendChild(stats.domElement);
    //     document.getElementById('code').style.left = '120px';
    // }
    // else {
    //     stats = {begin: function() {}, end: function() {}};
    // }
}

function scatterMeshes(geometry, options) {

    if (!options.mesh) {
        console.error('options.mesh is required for THREE.Terrain.ScatterMeshes but was not passed');
        return;
    }
    if (geometry instanceof THREE.BufferGeometry) {
        console.warn('The terrain mesh is using BufferGeometry but THREE.Terrain.ScatterMeshes can only work with Geometry.');
        return;
    }
    if (!options.scene) {
        options.scene = new THREE.Object3D();
    }
    lastModelScene = options.scene;

    var defaultOptions = {
        spread: 0.025,
        smoothSpread: 0,
        sizeVariance: 0.1,
        randomness: Math.random,
        maxSlope: 0.6283185307179586, // 36deg or 36 / 180 * Math.PI, about the angle of repose of earth
        maxTilt: Infinity,
        w: 0,
        h: 0,
    };
    for (var opt in defaultOptions) {
        if (defaultOptions.hasOwnProperty(opt)) {
            options[opt] = typeof options[opt] === 'undefined' ? defaultOptions[opt] : options[opt];
        }
    }

    var spreadIsNumber = typeof options.spread === 'number',
        randomHeightmap,
        randomness,
        spreadRange = 1 / options.smoothSpread,
        doubleSizeVariance = options.sizeVariance * 2,
        v = geometry.vertices,
        // meshes = [],
        up = options.mesh.up.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.5 * Math.PI);
    // for (var k = 0; k < geometry.vertices.length; k++) {
    //     geometry.vertices[k].vertexColors = new THREE.Color(255, 255, 255);
    // }
    if (spreadIsNumber) {
        randomHeightmap = options.randomness();
        randomness = typeof randomHeightmap === 'number' ? Math.random : function (k) {
            return randomHeightmap[k];
        };
    }
    // geometry.computeFaceNormals();
    for (var i = 0, w = options.w * 2; i < w; i++) {
        for (var j = 0, h = options.h; j < h; j++) {
            var key = j * w + i,
                f = geometry.faces[key],
                place = false;
            if (spreadIsNumber) {
                var rv = randomness(key);
                if (rv < options.spread) {
                    place = true;
                }
                else if (rv < options.spread + options.smoothSpread) {
                    // Interpolate rv between spread and spread + smoothSpread,
                    // then multiply that "easing" value by the probability
                    // that a mesh would get placed on a given face.
                    place = THREE.Terrain.EaseInOut((rv - options.spread) * spreadRange) * options.spread > Math.random();
                }
            }
            else {
                place = options.spread(v[f.a], key, f, i, j);
            }
            if (place) {
                // Don't place a mesh if the angle is too steep.
                if (f.normal.angleTo(up) > options.maxSlope) {
                    continue;
                }
                var mesh = options.mesh.clone();
                // mesh = new THREE.Mesh(g, options.material);
                // mesh.geometry.computeBoundingBox();
                // TODO
                mesh.position.copy(v[f.a]).add(v[f.b]).add(v[f.c]).divideScalar(3);
                // mesh.translateZ((mesh.geometry.boundingBox.max.z - mesh.geometry.boundingBox.min.z) * 0.5);
                if (options.maxTilt > 0) {
                    var normal = mesh.position.clone().add(f.normal);
                    mesh.lookAt(normal);
                    var tiltAngle = f.normal.angleTo(up);
                    if (tiltAngle > options.maxTilt) {
                        var ratio = options.maxTilt / tiltAngle;
                        mesh.rotation.x *= ratio;
                        mesh.rotation.y *= ratio;
                        mesh.rotation.z *= ratio;
                    }
                }
                mesh.rotation.x += 90 / 180 * Math.PI;
                mesh.rotateY(Math.random() * 2 * Math.PI);
                if (options.sizeVariance) {
                    var variance = Math.random() * doubleSizeVariance - options.sizeVariance;
                    mesh.scale.x = mesh.scale.z = 1 + variance;
                    mesh.scale.y += variance;
                }
                treemeshs.push(mesh);
            }
        }
    }

    // Merge geometries.
    var k, l;
    if (options.mesh.geometry instanceof THREE.Geometry) {
        var g = new THREE.Geometry();
        for (var i = 0; i < treemeshs.length; i++) {
            var newMat = [2];
            newMat[0] = treemeshs[i].material[0].clone();
            newMat[1] = treemeshs[i].material[1].clone();
            treemeshs[i].material = newMat;
        }

        for (k = 0, l = treemeshs.length; k < l; k++) {
            var m = treemeshs[k];
            m.updateMatrix();
            options.scene.add(treemeshs[k]);
            // g.merge(m.geometry, m.matrix);
        }
        /*
        if (!(options.mesh.material instanceof THREE.MeshFaceMaterial)) {
            g = THREE.BufferGeometryUtils.fromGeometry(g);
        }
        */

    }
    // There's no BufferGeometry merge method implemented yet.
    // else {
    // for (k = 0, l = treemeshs.length; k < l; k++) {
    //     options.scene.add(treemeshs[k]);
    // }
    // }

    return options.scene;
};

function draw() {
    // renderer.render(scene, useFPS ? fpsCamera : camera);
    renderer.render(scene, camera);
}

window.addEventListener('resize', function () {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = renderer.domElement.width / renderer.domElement.height;
    camera.updateProjectionMatrix();
    // fpsCamera.aspect = renderer.document.width / renderer.domElement.height;
    // fpsCamera.updateProjectionMatrix();
    draw();
}, false);
// document.addEventListener('mousemove', function (event) {
//     if (!paused) {
//         mouseX = event.pageX;
//         mouseY = event.pageY;
//     }
// }, false);

function setupControls() {
    // fpsCamera = new THREE.PerspectiveCamera(60, renderer.domElement.width / renderer.domElement.height, 1, 10000);
    // scene.add(fpsCamera);
    // controls = new THREE.FirstPersonControls(fpsCamera, renderer.domElement);
    // controls.freeze = true;
    // controls.movementSpeed = 100;
    // controls.lookSpeed = 0.075;

    // var geometry = new THREE.ConeBufferGeometry(20, 100, 3);
    // geometry.translate(0, 50, 0);
    // geometry.rotateX(Math.PI / 2);
    // helper = new THREE.Mesh(geometry, new THREE.MeshNormalMaterial());
    // scene.add(helper);
}

// Stop animating if the window is out of focus
function watchFocus() {
    var _blurred = false;
    window.addEventListener('focus', function () {
        if (_blurred) {
            _blurred = false;
            // startAnimating();
            // controls.freeze = false;
        }
    });
    window.addEventListener('blur', function () {
        // stopAnimating();
        _blurred = true;
        controls.freeze = true;
    });
}

function animate() {
    // stats.begin();
    draw();

    frameDelta += clock.getDelta();
    while (frameDelta >= INV_MAX_FPS) {
        update(INV_MAX_FPS);
        frameDelta -= INV_MAX_FPS;
    }

    // stats.end();
    if (!paused) {
        requestAnimationFrame(animate);
    }
}

function buildTree() {
    var material = [
        new THREE.MeshLambertMaterial({color: 0x3d2817}), // brown
        new THREE.MeshLambertMaterial({color: 0x2d4c1e}), // green
    ];

    var c0 = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 12, 6, 1, true));
    c0.position.y = 6;
    var c1 = new THREE.Mesh(new THREE.CylinderGeometry(0, 10, 14, 8));
    c1.position.y = 18;
    var c2 = new THREE.Mesh(new THREE.CylinderGeometry(0, 9, 13, 8));
    c2.position.y = 25;
    var c3 = new THREE.Mesh(new THREE.CylinderGeometry(0, 8, 12, 8));
    c3.position.y = 32;

    var g = new THREE.Geometry();
    c0.updateMatrix();
    c1.updateMatrix();
    c2.updateMatrix();
    c3.updateMatrix();
    g.merge(c0.geometry, c0.matrix);
    g.merge(c1.geometry, c1.matrix);
    g.merge(c2.geometry, c2.matrix);
    g.merge(c3.geometry, c3.matrix);

    var b = c0.geometry.faces.length;
    for (var i = 0, l = g.faces.length; i < l; i++) {
        g.faces[i].materialIndex = i < b ? 0 : 1;
    }

    var m = new THREE.Mesh(g, material);

    m.scale.x = m.scale.z = 5;
    m.scale.y = 1.25;
    return m;
}

function update(delta) {
    if (terrainScene) terrainScene.rotation.z = Date.now() * 0.00001;
    if (controls.update) controls.update(delta);
}

function startAnimating() {
    if (paused) {
        paused = false;
        controls.freeze = false;
        clock.start();
        requestAnimationFrame(animate);
    }
}

function onDocumentMouseMove(event) {
    event.preventDefault();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    var intersections = raycaster.intersectObjects(treemeshs);
    var intersected;
    if (intersections.length > 0) {
        intersected = intersections[0].object;
        if (intersected && intersected != lastIntersected) {
            currentIntersected = intersected;
            if (lastIntersected != currentSelected) {
                lastIntersected.material[1].color.setHex(baseColor);
            }
            currentIntersected.material[1].color.setHex(intersectColor);
            lastIntersected = currentIntersected;
        }
        document.body.style.cursor = 'pointer';
    } else {
        document.body.style.cursor = 'auto';
        if (lastIntersected != currentSelected) {
            lastIntersected.material[1].color.setHex(baseColor);
        }
    }


    // mouse.x = ( event.clientX / renderer.domElement.clientWidth ) * 2 - 1;
    // mouse.y = - ( event.clientY / renderer.domElement.clientHeight ) * 2 + 1;
    // raycaster.setFromCamera( mouse, camera );
    //
    // // See if the ray from the camera into the world hits one of our meshes
    // var intersects = raycaster.intersectObject(terrainScene.children[0]);
    // // console.log(intersects.length);
    // // Toggle rotation bool for meshes that we clicked
    // if ( intersects.length > 0 ) {
    //     // 小三角的位置
    //     console.log(intersects[0]);
    //     helper.position.set( 0, 0, 0 );
    //     helper.lookAt( intersects[ 0 ].face.normal );
    //
    //     helper.position.copy( intersects[ 0 ].point );
    //
    // }
}

function onDocumentMouseClick() {
    event.preventDefault();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
// TODO: Raycasting to terrain, but get weird result
    if (currentSelected) {
        // terrainScene.children[0].geometry.computeCentroids();
        terrainScene.children[0].geometry.computeFaceNormals();
        console.log(terrainScene.children[0]);

        // raycasting to terrain's mesh
        // for (var i = 0; i < terrainScene.children[0].faces.length; i++) {
        //     intersections = raycaster.intersectObject(terrainScene.children[0].faces[i]);
        //     if(intersections){
        //         break;
        //     }
        // }

        // if select a tree, and click another tree
        intersections = raycaster.intersectObjects(treemeshs);
        // terrainScene.children[0].raycast(raycaster, interactions);
        if (intersections.length > 0) {
            lastSelected = currentSelected;
            lastSelected.material[1].color.setHex(baseColor);
            currentSelected = intersections[0].object;
        } else {
            // if select a tree and click an empty space, change position
            intersections = raycaster.intersectObject(terrainScene.children[0]);
            if (intersections.length > 0) {
                currentSelected.position.set(0, 0, 0);
                // currentSelected.lookAt(intersections[0].face.normal);
                console.log("The log below is from the intersect point");
                console.log(intersections[0].point);
                currentSelected.position.copy(intersections[0].point);
                sphereMesh.position.copy(intersections[0].point);
                lastSelected.material[1].color.setHex(baseColor);
                currentSelected = null;
            }
        }
    } else {
        // if no tree is selected
        raycaster.setFromCamera(mouse, camera);
        var intersections = raycaster.intersectObjects(treemeshs);
        var intersected;
        // console.log(intersections);
        if (intersections.length > 0) {
            intersected = intersections[0].object;
            if (intersected) {
                if (lastSelected) {
                    lastSelected.material[1].color.setHex(baseColor);
                    lastSelected = intersected;
                    currentSelected = intersected;
                    currentSelected.material[1].color.setHex(intersectColor);
                } else {
                    if (currentSelected == null) {
                        currentSelected = intersected;
                        currentSelected.material[1].color.setHex(intersectColor);
                        lastSelected = currentSelected;
                    } else if (intersected != currentSelected) {
                        lastSelected.material[1].color.setHex(baseColor);
                        lastSelected = intersected;
                        currentSelected = intersected;
                        currentSelected.material[1].color.setHex(intersectColor);
                    } else {
                        lastSelected = null;
                        currentSelected = null;
                    }
                }
            }
        }
    }


}

function stopAnimating() {
    paused = true;
    controls.freeze = true;
    clock.stop();
}

function setupModel() {
    var manager = new THREE.LoadingManager();
    manager.onProgress = function (item, loaded, total) {

        console.log(item, loaded, total);

    };

    // var textureLoader = new THREE.TextureLoader( manager );
    // var texture = textureLoader.load( 'textures/UV_Grid_Sm.png' );

    // var material = new THREE.MeshPhongMaterial();
    // material.map = THREE.ImageUtils.loadTexture('textures/UV_Grid_Sm.png');
    var textureLoader = new THREE.TextureLoader(manager);
    var texture = textureLoader.load('textures/house.png');
    var onProgress = function (xhr) {
        if (xhr.lengthComputable) {
            var percentComplete = xhr.loaded / xhr.total * 100;
            console.log(Math.round(percentComplete, 2) + '% downloaded');
        }
    };

    var onError = function (xhr) {
    };

    var loader = new THREE.OBJLoader(manager);
    // loader.load('obj/male02/male02.obj', function (object) {
    loader.load('obj/house.obj', function (object) {

        object.traverse(function (child) {

            if (child instanceof THREE.Mesh) {

                child.material.map = texture;

            }

        });
        // console.log(object);
        // object.material.map = texture;
        object.position.set(0, 0, 0);
        object.scale.set(50, 50, 50);
        // object.position.y = 95;
        scene.add(object);

    }, onProgress, onError);
}

function setup() {
    setupThreeJS();
    // setupModel();
    setupWorld();
    setupControls();
    setupDatGui();
    startAnimating();
}

setup();