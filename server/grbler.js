//     Grbler - a Node.js based CNC controller for GRBL
//
//     Copyright © 2022 - 2023 Craig Altenburg
//
//     Portions Copyright © 2021 Andrew Hodel
//
//     THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
//     WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
//     MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
//     ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
//     WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
//     ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
//     OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
//
//     This program is free software: you can redistribute it and/or modify
//     it under the terms of the GNU Affero General Public License version 3.0 as
//     published by the Free Software Foundation.
//
//     This program is distributed in the hope that it will be useful,
//     but WITHOUT ANY WARRANTY; without even the implied warranty of
//     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//     GNU Affero General Public License for more details.
//
//     You should have received a copy of the GNU Affero General Public License
//     along with this program.  If not, see <http://www.gnu.org/licenses/>.

// ============================================================================
//  Requirements
// ============================================================================

import { config }     from "./config.js";
import * as grbl      from "./grbl_device.js"

import nodeStatic     from 'node-static';
import qs             from 'querystring';
import http           from 'http';

import * as socketio  from 'socket.io';

import SerialPort     from "serialport";

// const EventEmitter = require( 'events' ).EventEmitter;
// const url          = require( 'url' );
// const fs           = require( 'fs' );

// ============================================================================
//  Global Storage
// ============================================================================

const gGrblDevice = grbl.GrblDevice;
const gDevice     = gGrblDevice.device();
                                 
// ============================================================================
//  Function Definitions
// ============================================================================

// ----------------------------------------------------------------------------
//  Function setUpSocket
// ----------------------------------------------------------------------------
// This function is called when a client connects to us.  It sets up a
// series of responders that handle the various messages to the client.

function setUpSocket( inSocket )
{
  console.log( 'Setting up socket' );

  inSocket.emit( 'config', config );

  gGrblDevice.connect( deviceCallback, inSocket );

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  //  Handlers for messages from client.
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  // --- do-reset --------------------------------------------

  inSocket.on( 'do-reset', () =>
  {
    gDevice.reset();
  } );

  // --- do-auto-home -----------------------------------------

  inSocket.on( 'do-auto-home', () =>
  {
    gDevice.autoHome();
  } );

  // --- queue-to-grbl ----------------------------------------
  // Add data to the queue to send to GRBL

  inSocket.on( 'queue-to-grbl', (inData) =>
  {
    gDevice.queueCommands( inData.line );
  } );

  // --- clear-queue-item -----------------------------------------
  // Clear the "send to GRBL" queue

  inSocket.on( 'clear-queue', ( inData ) =>
  {
    gDevice.clearQueue();
  } );

  // --- pause -----------------------------------------------
  // Pause or resume sending to GRBL

  inSocket.on( 'pause-queue', ( inPauseQueue ) =>
  {
    gDevice.pauseQueue( inPauseQueue );
} );

  // --- request-gcode-state ---------------------------------

  inSocket.on( 'request-parser-state', () =>
  {
    gDevice.requestParserState();
  } );

  // --- request-gcode-params -------------------------------

  inSocket.on( 'request-gcode-params', () =>
  {
    gDevice.requestGCodeParams();
  } );

  // --- request-grbl-settings -------------------------------

  inSocket.on( 'request-grbl-settings', () =>
  {
    gDevice.requestGrblSettings();
  } );

  // --- jog-x ---------------------------------------------

  inSocket.on( 'jog-x', ( value ) =>
  {
    gDevice.jogX( value );
  } );

  // --- jog-y ---------------------------------------------

  inSocket.on( 'jog-y', ( value ) =>
  {
    gDevice.jogY( value );
  } );

  // --- jog-z ---------------------------------------------

  inSocket.on( 'jog-z', ( value ) =>
  {
    gDevice.jogZ( value );
  } );

  // --- disconnect ------------------------------------------

  inSocket.on( 'disconnect', () =>
  {
    gDevice.disconnect();
  } );
}

// ----------------------------------------------------------------------------
//  Function deviceCallback
// ----------------------------------------------------------------------------

function deviceCallback( inMessage, inData, inSocket )
{
  switch (inMessage)
  {
  case grbl.MACHINE_STATE:
    inSocket.emit( 'machine-status', inData );
    break;
  
  case grbl.CONSOLE_DISPLAY:
    inSocket.emit( 'console-display', inData );
    break;

  case grbl.GRBL_SETTING:
    inSocket.emit( 'grbl-setting', inData );
    break;

  case grbl.GCODE_PARAM:
    inSocket.emit( 'gcode-parameters', inData );
    break;

  case grbl.GCODE_MODE:
    inSocket.emit( 'gcode-mode', inData );
    break;
  }
}

// ----------------------------------------------------------------------------
//  Function httpHandler
// ----------------------------------------------------------------------------
// This function handles http requests. Most are handled by the fileServer
// instance which serve pages out of the 'html' directory.  We do handle
// POST requests to /api/uploadGcode by passing the received GCode on to
// the connected client.

function httpHandler( inRequest, inResult )
{
  //console.log( "HTML Request:", inRequest.url );

  if (inRequest.url.indexOf( '/api/uploadGcode' ) == 0  &&  inRequest.method == 'POST')
  {
    // this is a gcode upload, probably from jscut

    console.log( 'new data receive from web api' );

    let b = '';

    inRequest.on( 'data', ( inData ) =>
    {
      b += inData;

      if (b.length > 1e6)
      {
        inRequest.connection.destroy();
      }
    } );

    inRequest.on( 'end', () =>
    {
      const post = qs.parse( b );

      console.log( '...complete' );

      io.sockets.emit( 'load-gcode', { 'val': post.val } );

      inResult.writeHead( 200, { "Content-Type": "application/json" } );

      inResult.end( JSON.stringify( { 'data': 'ok' } ) );
    } );
  }
  else
  {
    fileServer.serve( inRequest,
                      inResult,
                      ( inError, inResult ) => {
                                                 if (inError)
                                                 {
                                                  console.log( 'fileServer error: ', inError );
                                                  console.log( 'Request: ',          inRequest.url );
                                                }
                                               } );
  }
}

// ----------------------------------------------------------------------------
//  Function htmlEncode
// ----------------------------------------------------------------------------
// Encode special characters for use in html.

function htmlEncode( str )
{
  c = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#039;',
    '#': '&#035;'
  };

  return str.replace( /[<&>'"#]/g, ( s ) => { return c[s]; } );
}

// ============================================================================
//  Initialization Code
// ============================================================================

Error.stackTraceLimit = Infinity;

// --- Test for webcam --------------------------------------------------------

if (config.webcamVideoURL != '')
{
  console.log( 'Look for webcam at:', config.webcamVideoURL );

  http.get( config.webcamVideoURL,
            ( inResult ) => {
                              // valid response, enable webcam
                              console.log( 'Enabling webcam.' );
                            } )
//     .on( 'socket',
//          ( inSocket ) => {
//                            // 2 second timeout on this socket
//                            inSocket.setTimeout( 2000 );
//                            inSocket.on( 'timeout',
//                                         () => {
//                                                 console.log( 'Webcam timeout.' );
//  //                                               this.abort();
//                                                 config.webcamVideoURL = '';
//                                               } );
//                          } )
    .on( 'error',
         ( inError ) => {
                          console.log(   'Got error: '
                                       + inError.message
                                       + ' not enabling webcam.' );
                          config.webcamVideoURL = '';
                        } );
}

// --- Initialize http server -------------------------------------------------

const httpServer = http.createServer( httpHandler ).listen( config.webPort );

const io         = new socketio.Server( httpServer, { /* options */ } );

const fileServer = new nodeStatic.Server( './html' );

console.log( 'http server listening on port ' + config.webPort );

// --- Set up http handlers ---------------------------------------------------

io.sockets.on( 'connection', setUpSocket );
