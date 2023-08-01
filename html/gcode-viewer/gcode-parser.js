function GCodeParser( inHandlers )
{
  this.handlers = inHandlers || {};
}

function parseLine( inText, inInfo ) 
{
  inText = inText.replace( /;.*$/, '' ).trim(); // Remove comments

  if (inText)
  {
    var tokens = inText.split(' ');

    if (tokens)
    {
      var cmd  = tokens[0];
      var args = { 'cmd': cmd };

      tokens.splice( 1 ).forEach( token =>
        {
          try
          {
            var key = token[0].toLowerCase();
          }
          catch (err)
          {
            // if there's an error, it just means that toLowerCase cannot lowercase a space
            var key = token[0];
          }

          var value = parseFloat( token.substring( 1 ) );
          args[key] = value;
        } );

      var handler =    this.handlers[tokens[0]]
                    || this.handlers['default'];
      if (handler)
      {
        return handler( args, inInfo );
      }
    }
  }
};

function parser( inGcode )
{
  var lines = inGcode.split( '\n' );

  for (var i = 0; i < lines.length; i++)
  {
    if (this.parseLine( lines[i], i ) === false)
    {
      break;
    }
  }
};
GCodeParser.prototype.parseLine = parseLine;
GCodeParser.prototype.parse     = parser;

