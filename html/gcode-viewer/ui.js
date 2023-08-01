var scene  = null;
var object = null;
var added  = false;

$( () => { scene = createScene( $('#render-area') ); } );

function createObject( inGcode ) 
{
    if (object) 
    {
        scene.remove( object );
    }

    object = createObjectFromGCode( inGcode );

    scene.add( object );
}

function openGCodeFromText( inGcode ) 
{
  if (document.hasFocus())
  {
	  createObject( inGcode );
    console.log('adding object with existing focus');
  }
  else
  {
    // wait for focus, then render
    
    console.log('waiting for focus');
	
    $(window).bind( 'focus', event => 
    {
	  createObject( inGcode );
      
      console.log('focus exists');

      // unbind for next object load
      $(this).unbind( event );
    });
  }
}
