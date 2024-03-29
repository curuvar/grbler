function createScene( inParent )
{
  // renderer setup
  var renderer = new THREE.WebGLRenderer( { autoClearColor: true } );

  renderer.setClearColor( 0xffffff, 1 );
  renderer.setSize( inParent.width(), inParent.height() );
  inParent.append( renderer.domElement );
  renderer.clear();

  // scene

  var scene = new THREE.Scene();

  // lighting

  var directionalLight = new THREE.DirectionalLight( 0xffffff, 0.5 );
  directionalLight.position.set( 0, 1, 0 );
  scene.add( directionalLight );

  // camera

  var fov    = 45;
  var aspect = inParent.width() / inParent.height();
  var near   = 1;
  var far    = 12000;
  var camera = new THREE.PerspectiveCamera( fov, aspect, near, far );

  camera.position.z = 300;
  scene.add( camera );

  controls = new THREE.TrackballControls( camera, renderer.domElement );
  controls.noPan       = false;
  controls.noZoom      = false;
  controls.zoomSpeed   = 1.2;
  controls.panSpeed    = 1;
  controls.rotateSpeed = 1;

  // render

  function render()
  {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }

  render();

  // fix controls if window is resized.

  $(window).on( 'resize', () =>
  {
    controls.screen.width = window.innerWidth;
    controls.screen.height = window.innerHeight;
  });

  return scene;
}
