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

import SerialPort     from "serialport";
import { config }     from "./config.js";

import * as jogger    from "./jogger.js"

// ============================================================================
//  External Constants
// ============================================================================

export const MACHINE_STATE    = 0;
export const CONSOLE_DISPLAY  = 1;
export const GRBL_SETTING     = 2;
export const GCODE_PARAM      = 3;
export const GCODE_MODE       = 4;

export const QUEUE_STOPPED    = 0;       // queue state stopped -- nothing to do
export const QUEUE_RUNNING    = 1;       // queue state running
export const QUEUE_PAUSED     = 2;       // queue state temporary pause

// ============================================================================
//  Class GrblDevice
// ============================================================================

export class GrblDevice
{
  #path;               // The path to the serial port for connected GRBL device
  #serialPort;         // actual serialport for connection
  #queue;              // Queued commands to send to port
  #queueCurrentMax;    // Current max queue length
  #queueState;         // Current queue state
  #clients;            // Clients connected to this port
  #pipe;               // Keep GC from collecting our pipe
  #lastSerialWrite;    // Keep GC from collecting written data
  #lastSerialReadLine; // Keep GC from collecting last read line
  #machineStatus;      // Last received Machine Status
  #positionX;          // Last received Machine Position X
  #positionY;          // Last received Machine Position Y
  #positionZ;          // Last received Machine Position Z
  #wcoX;               // Last received Work coordinate offset X
  #wcoY;               // Last received Work coordinate offset Y
  #wcoZ;               // Last received Work coordinate offset Z
  #stepsX;             // Steps per mm X
  #stepsY;             // Steps per mm Y
  #stepsZ;             // Steps per mm Z
  #maxX;               // Maximum movement mm X
  #maxY;               // Maximum movement mm Y
  #maxZ;               // Maximum movement mm Z
  #displayIsInches;    // If display values are in inches.
  #homingEnabled;      // Set to 1 if homing enabled
  #isJogging;          // Set true in jogging in progress. 
  #joggingTargetX;     // Jogging target in machine coordinates
  #joggingTargetY;     // Jogging target in machine coordinates
  #joggingTargetZ;     // Jogging target in machine coordinates
  #jogger;             // The jogger instance.

  // ==========================================================================
  //  Static Fields
  // ==========================================================================

  // Holds the connected port singleton instance.
  static #device       = new GrblDevice();  

  // ==========================================================================
  //  Public Static Functions
  // ==========================================================================

  // --------------------------------------------------------------------------
  //  Public function device
  // --------------------------------------------------------------------------

  static device()
  {
    return GrblDevice.#device;
  }

  // ----------------------------------------------------------------------------
  //  Public function connect
  // ----------------------------------------------------------------------------
  //  This function connects the caller to the GRBL device.
  // 
  //  When the caller is finished with the connection, the caller should call
  //  the GrblDevice's disconnect function.
  //
  //  The argument includes a callback function that the GrblDevice uses to pass
  //  data back to the user.  This function should have the arguments:
  //            ( device, message, data, parameter )
  //      where:
  //            message   - a string that identifies the message being passed
  //            data      - (depends on message type)
  //            parameter - the value passed in inParameter 
  //
  //  The message types that should be processed are:
  //
  //          message                 data
  //      --------------------  -------------------------------------------------
  //      'queue-status'        Queue: currentLength, maxLength & state
  //      'console-display'     Display: mode, message
  //      'machine-status'      GRBL device: status, mpos & wpos
  //      'grbl-setting',       $nnn: setting & value
  //      'gcode-parameters'    GCode: setting, xValue, yValue, zValue & other
  //      'gcode-mode'          Mode: moveType, origin, arcs, useInch, absolute
  //                                  motionMode, spindleStop, coolantOn,
  //                                  toolOffset, feedRate & spindleSpeed
  //
  //  Arguments:
  //    inCallback  - the callback function
  //    inParameter - a parameter to return to the callback function
  //
  //  Returns:
  //    A (possibly shared) GrblDevice instance

  static connect( inCallback, inParameter )
  {
    const theClient = {};
    theClient.callback  = inCallback;
    theClient.parameter = inParameter;

    const theDevice = GrblDevice.#device

    theDevice.#clients.push( theClient );

    theDevice.#doCommands( '$G\n$$\n$#' );

    return theDevice;
  }

  // ----------------------------------------------------------------------------
  //  Public function joggerCallback
  // ----------------------------------------------------------------------------

  static joggerCallback( inCommand, inData )
  {
    const theDevice = GrblDevice.#device;

    console.log( 'joggerCallback', inCommand, inData );

    switch (inCommand)
    {
    case 'change-coords':
      theDevice.#doCommands( 'G' + (inData + 53) );
      theDevice.requestParserState();
      break;

    case 'auto-home':
      theDevice.autoHome();
      break;

    case 'jog-x':
      theDevice.jogX( inData );
      break;

    case 'jog-y':
      theDevice.jogY( inData );
      break;

    case 'jog-z':
      theDevice.jogZ( inData );
      break;

    case 'update-x':
      theDevice.queueCommands( 'G10L20P' + inData + 'X0' );
      break;

    case 'update-y':
      theDevice.queueCommands( 'G10L20P' + inData + 'Y0' );
      break;
      
    case 'update-z':
      theDevice.queueCommands( 'G10L20P' + inData + 'Z0' );
      break;
    }
  }

  // ==========================================================================
  //  Public Instance Methods
  // ==========================================================================
  // --------------------------------------------------------------------------
  //  Initializer for GrblDevice
  // --------------------------------------------------------------------------
  // Creates and initializes a structure that holds the data needed to
  // communicate with a GRBL device. 

  constructor()
  {
    this.#queue              = [];      // Queued commands to send to port
    this.#queueCurrentMax    = 0;       // Current max queue length
    this.#queueState         = QUEUE_STOPPED; // Current queue state
    this.#clients            = [];      // Clients connected to this port
    this.#lastSerialWrite    = [];      // Keep GC from collecting written data
    this.#lastSerialReadLine = '';      // Keep GC from collecting last read line
    this.#machineStatus      = 'Init';  // Last received Machine Status
    this.#positionX          = 0;       // Last received Machine Position X
    this.#positionY          = 0;       // Last received Machine Position X
    this.#positionZ          = 0;       // Last received Machine Position X
    this.#wcoX               = 0;
    this.#wcoY               = 0;
    this.#wcoZ               = 0;
    this.#displayIsInches    = false;
    this.#isJogging          = false;

    this.#serialPort = new SerialPort( config.serialPort, 
                                       { baudRate: config.serialBaudRate } );

    this.#pipe       = new SerialPort.parsers.Readline( { delimiter: '\r\n' } );

    this.#serialPort.pipe( this.#pipe );

    this.#serialPort.on( "open", () =>
    {
      console.log( 'serial port: ', config.serialPort, config.serialBaudRate );

      // Send a question mark command to GRBL every 1000ms.

      setInterval( () =>
                  {
                    this.#serialPort.write( '?' );
                  },
                  1000 );
    } );

    // Register a handler for data received on the pipe

    this.#pipe.on( "data", ( inData ) =>
    {
      this.#processSerialData( inData );
    } );

    if (config.useJogger)
    {
      jogger.initialize( GrblDevice.joggerCallback );
    }

    console.log( 'GrblDevice constructor complete.' );
  }

  // --------------------------------------------------------------------------
  // Public Method disconnect
  // --------------------------------------------------------------------------
  // Inform the GrblDevice that it is no longer needed

  disconnect()
  {
    // Currently does nothing but could clean up if no one is using the port.
  }

  // --------------------------------------------------------------------------
  // Public Method queueCommands
  // --------------------------------------------------------------------------
  //  This function accepts a string with one or more commands (separated by
  //  new-line characters) and queues the commands to be sent to the GRBL
  //  device

  queueCommands( inCommands )
  {
    const theCommands = inCommands.split( "\n" );
    // add to queue

    this.#queue = this.#queue.concat( theCommands );

    // add to #queueCurrentMax

    this.#queueCurrentMax += theCommands.length;

    if (this.#queueState == QUEUE_STOPPED)
    {
      this.#queueState = QUEUE_RUNNING;
      
      this.#callbackMachineStatus();
      this.#transmitNextItem();
    }
  }

  // --------------------------------------------------------------------------
  // Public Method pauseQueue
  // --------------------------------------------------------------------------

  pauseQueue( inPause )
  {
    if (inPause)
    {
      console.debug( 'queue paused' );

      this.#queueState = QUEUE_PAUSED;
    }
    else if (this.#queue.length == 0)
    {
      console.debug( 'queue stopped' );

      this.#queueState = QUEUE_STOPPED;
    }
    else if (this.#queueState != QUEUE_RUNNING)
    {
      console.debug( 'queue resumed' );

      this.#queueState = QUEUE_RUNNING;
      this.#transmitNextItem();
    }

    this.#callbackMachineStatus();
  }

  // --------------------------------------------------------------------------
  // Public Method clearQueue
  // --------------------------------------------------------------------------

  clearQueue()
  {
    this.#queueState         = QUEUE_STOPPED;
    this.#queue              = [];
    this.#queueCurrentMax    = 0;
    this.#lastSerialWrite    = [];
    this.#lastSerialReadLine = '';

    this.#callbackMachineStatus();
  }

  // --------------------------------------------------------------------------
  // Public Method autoHome
  // --------------------------------------------------------------------------

  autoHome()
  {
    this.#doCommands(  this.#homingEnabled ? "$H" : "$X"  );
  }
  // --------------------------------------------------------------------------
  // Public Method requestParserState
  // --------------------------------------------------------------------------

  requestParserState()
  {
    this.#doCommands( '$G' );
  }

  // --------------------------------------------------------------------------
  // Public Method requestGCodeParams
  // --------------------------------------------------------------------------

  requestGCodeParams()
  {
    this.#doCommands( '$#' );
  }

  // --------------------------------------------------------------------------
  // Public Method requestGrblSettings
  // --------------------------------------------------------------------------

  requestGrblSettings()
  {
    this.#doCommands( '$$' );
  }

  // --------------------------------------------------------------------------
  // Public Method jogX
  // --------------------------------------------------------------------------

  jogX( inDistance )
  {
    if (!this.#isJogging)
    {
      this.#isJogging = true;
      this.#joggingTargetX = this.#positionX;
      this.#joggingTargetY = this.#positionY;
      this.#joggingTargetZ = this.#positionZ;
    }

    console.log( 'jogX inDistance', inDistance );
    console.log( '     target    ', this.#joggingTargetX );
    console.log( '     steps     ', this.#stepsX );

    let jogTo = this.#joggingTargetX + (inDistance / this.#stepsX);

    if (jogTo > 0)
    {
      jogTo = 0;
    }
    else if (jogTo < -this.#maxX)
    {
      jogTo = -this.#maxX;
    }

    if (this.#displayIsInches) jogTo /= 25.4;

    this.queueCommands( '$J=F1000G53X' + jogTo );
  }

  // --------------------------------------------------------------------------
  // Public Method jogY
  // --------------------------------------------------------------------------

  jogY( inDistance )
  {
    if (!this.#isJogging)
    {
      this.#isJogging = true;
      this.#joggingTargetX = this.#positionX;
      this.#joggingTargetY = this.#positionY;
      this.#joggingTargetZ = this.#positionZ;
    }

    let jogTo = this.#joggingTargetY + (inDistance / this.#stepsY);

    if (jogTo > 0)
    {
      jogTo = 0;
    }
    else if (jogTo < -this.#maxX)
    {
      jogTo = -this.#maxX;
    }

    if (this.#displayIsInches) jogTo /= 25.4;

    this.queueCommands( '$J=F1000G53Y' + jogTo );
}

  // --------------------------------------------------------------------------
  // Public Method jogZ
  // --------------------------------------------------------------------------

  jogZ( inDistance )
  {
    if (!this.#isJogging)
    {
      this.#isJogging = true;
      this.#joggingTargetX = this.#positionX;
      this.#joggingTargetY = this.#positionY;
      this.#joggingTargetZ = this.#positionZ;
    }

    let jogTo = this.#joggingTargetZ + (inDistance / this.#stepsZ);

    if (jogTo > 0)
    {
      jogTo = 0;
    }
    else if (jogTo < -this.#maxZ)
    {
      jogTo = -this.#maxZ;
    }

    if (this.#displayIsInches) jogTo /= 25.4;

    this.queueCommands( '$J=F1000G53Z' + jogTo );
  }

  // --------------------------------------------------------------------------
  // Public Method reset
  // --------------------------------------------------------------------------

  reset()
  {
    // reset queue and the grbl device

    this.#queueState         = QUEUE_STOPPED;
    this.#queue              = [];
    this.#queueCurrentMax    = 0;
    this.#lastSerialWrite    = [];
    this.#lastSerialReadLine = '';

    this.#serialPort.write( "\x18" );

    this.#callback( CONSOLE_DISPLAY, { mode:   'immediate', 
                                       message: '-> RESET <-' } );
  }

  // --------------------------------------------------------------------------
  // Private Method transmitNextItem
  // --------------------------------------------------------------------------
  //  This function transmits the next queued command to the the GRBL device.

  #transmitNextItem()
  {
    // If there is nothing in the queue mark the queue as stopped.

    if (this.#queue.length <= 0)
    {
      this.#queueState = QUEUE_STOPPED;
      this.#callbackMachineStatus();
      return;
    }

    // Pop an item off the queue.

    let anItem = this.#queue.shift();

    // Remove any comments after the command and trim and new-line character.

    anItem = anItem.split( ';' )[0].trim();

    // If the item is empty or is a comment send the next item.

    if (anItem == ''  ||  anItem.indexOf( ';' ) == 0)
    {
      setTimeout( () =>{ this.#transmitNextItem(); } );
      return;
    }

    console.debug( "-> " + anItem );

    // Log the command to the console

    this.#callback( CONSOLE_DISPLAY, { mode:   'command', 
                                       message: anItem } );

    // Send the command to GRBL

    this.#serialPort.write( anItem + "\n" );

    // Append the command to the #lastSerialWrite list.

    this.#lastSerialWrite.push( anItem );

    // Update Jogger if needed

    if (config.useJogger)
    {
      const parts = anItem.split( '=' );

      switch (anItem[0])
      {
        case 'g54':  jogger.updateOrigin( 1 );         break; 
        case 'g55':  jogger.updateOrigin( 2 );         break; 
        case 'g56':  jogger.updateOrigin( 3 );         break; 
        case 'g57':  jogger.updateOrigin( 4 );         break; 
        case 'g58':  jogger.updateOrigin( 5 );         break; 
        case 'g59':  jogger.updateOrigin( 6 );         break; 
      }
    }

    // If the queue length is now zero -- clear the current max.

    if (this.#queue.length <= 0)
    {
      this.#queueCurrentMax = 0;
      this.#queueState      = QUEUE_STOPPED;
    }

    // Send the updated queue status to the client[s].

    this.#callbackMachineStatus();
  }

  // --------------------------------------------------------------------------
  // Private Method processSerialData
  // --------------------------------------------------------------------------
  //  This function processes data returned from the GRBL device.

  #processSerialData( inData )
  {
    // --- Handle status report query ('?') result --------
    // This data will start with a '<' character

    if (inData.indexOf( '<' ) == 0)
    {
      console.debug( "<- " + inData + " ; status report" );

      // remove first <

      let t = inData.substr(1);

      // remove last >

      t = t.substr(0, t.length - 2);

      // split on ',', ':', and '|'

      t = t.split( /,|:|\|/ );

      // console.log( 'Status:', t );

      // Save the position

      if (this.#isJogging  &&  t[0] != 'Jog')
      {
        this.#isJogging = false;
      }

      this.#machineStatus = t[0]
      this.#positionX     = parseFloat( t[2] );
      this.#positionY     = parseFloat( t[3] );
      this.#positionZ     = parseFloat( t[4] );
  

      // If we were passed Work Coordinate Offsets, save as floats.

      if (t[8] == 'WCO')
      {
        this.#wcoX = parseFloat( t[ 9] );
        this.#wcoY = parseFloat( t[10] );
        this.#wcoZ = parseFloat( t[11] );

        // console.log( "New WCO:", #wcoX, #wcoY, #wcoZ );

        if (config.useJogger)
        {
          jogger.updateOffsets( this.#wcoX, 
                                this.#wcoY, 
                                this.#wcoZ );
        }
      }

      // console.log( 'Work:', work );
      this.#callbackMachineStatus();

      return;
    }

    // --- Handle GRBL setting query ('$$') result --------
    // This data will start with a '$' character and be
    // in the form #<number> = <number>.

    let match = inData.match( /^(\$[0-9]+)=([-.0-9]+)$/ )

    if (match != null)
    {
      console.debug( "<- " + inData + " ; GRBL setting" );

      this.#callback( GRBL_SETTING, { 'setting' : match[1], 
                                      'value'   : match[2] } );

      if (config.useJogger)
      {
        switch (match[1])
        {
          case '$22':  this.#homingEnabled = match[2]; break;
          case '$100': this.#stepsX        = match[2]; break;
          case '$101': this.#stepsY        = match[2]; break;
          case '$102': this.#stepsZ        = match[2]; break;
          case '$130': this.#maxX          = match[2]; break;
          case '$131': this.#maxY          = match[2]; break;
          case '$132': this.#maxZ          = match[2]; break;
        }
      }                                                 

      if (match[1] == '$13')
      {
        this.#displayIsInches = (match[2] == '1');
      }

      return;
    }

    // --- Handle gcode parameters query ('$#') result --------
    // This data will start with a '[' character

    match = inData.match( /^\[(G[0-9]+|TLO|PRB):([^,:]*),?([^,:]*)?,?([^,:]*)?:?(.*)]$/ );

    if (match != null)
    {
      console.debug("<- " + inData + " ; GCode parameter" );

      this.#callback( GCODE_PARAM, { 'setting' : match[1],
                                     'xValue'  : match[2],
                                     'yValue'  : match[3],
                                     'zValue'  : match[4],
                                     'other'   : match[5] } );
      return;
    }

    // --- Handle gcode mode query ('$G') result --------
    // This data will start with a '[GC' string

    match = inData.match( /^\[GC:(([A-Z][0-9]* ?)*)]$/ );

    if (match != null)
    {
      let moveType      = 0;
      let origin        = 54;
      let arcs          = 0;
      let useInch       = false;
      let absolute      = true;
      let motionMode    = 1;
      let spindleStop   = false;
      let coolantOn     = true;
      let toolOffset    = 0;
      let feedRate      = 0;
      let spindleSpeed  = 0;

      console.debug("<- " + inData + " ; GCode mode" );

      match[1].split( ' ' ).forEach( ( anItem ) =>
      {
        switch (anItem)
        {
          case 'G0':  moveType    =  0;    break; // Set rapid positioning
          case 'G1':  moveType    =  1;    break; // Set normal straight line 
          case 'G2':  moveType    =  2;    break; // Set clockwise arc
          case 'G3':  moveType    =  3;    break; // Set anti-clockwise arc

          case 'G54': origin      = 54;    break; // Set G54 values as work offset
          case 'G55': origin      = 55;    break; // Set G55 values as work offset
          case 'G56': origin      = 56;    break; // Set G56 values as work offset
          case 'G57': origin      = 57;    break; // Set G57 values as work offset
          case 'G58': origin      = 58;    break; // Set G58 values as work offset
          case 'G59': origin      = 59;    break; // Set G59 values as work offset

          case 'G17': arcs        =  0;    break; // Set XY arc plane
          case 'G18': arcs        =  1;    break; // Set ZX arc plane
          case 'G19': arcs        =  2;    break; // Set ZY arc plane

          case 'G20': useInch     = true;  break; // Set use inches for distance and position
          case 'G21': useInch     = false; break; // Set use mm for distance and position

          case 'G90': absolute    = true;  break; // Set absolute coordinate mode
          case 'G91': absolute    = false; break; // Set relative coordinate mode

          case 'G93': motionMode  = 0;     break; // Set inverse time motion mode
          case 'G94': motionMode  = 1;     break; // Set units/mm motion mode

          case 'M5':  spindleStop = true;  break; // Set spindle stop

          case 'M9':  coolantOn   = false; break; // Set coolant off

          default:
          {
            let value = anItem.slice( 1 );

            switch (anItem[0])
            {
              case 'T': toolOffset   = value; break;
              case 'F': feedRate     = value; break;
              case 'S': spindleSpeed = value; break;

              default: console.error( "Unhandled gcode mode: " + anItem );
            }
          };
        }
      } );

      if (config.useJogger)
      {
        jogger.updateOrigin( origin - 53 );
      }

      this.#callback( GCODE_MODE, { 'moveType'     : moveType,
                                    'origin'       : origin,
                                    'arcs'         : arcs,
                                    'useInch'      : useInch,
                                    'absolute'     : absolute,
                                    'motionMode'   : motionMode,
                                    'spindleStop'  : spindleStop,
                                    'coolantOn'    : coolantOn,
                                    'toolOffset'   : toolOffset,
                                    'feedRate'     : feedRate,
                                    'spindleSpeed' : spindleSpeed } );
      return;
    }


    // --- Handle unlock request string --------
    // This data will start with a '[MSG:' string and
    // ends with 'unlock]'.

    match = inData.match( /^\[MSG:.*unlock]$/ );

    if (match != null)
    {
      console.debug( "<- " + inData + " ; unlock request" );

      this.#doCommands( '$G\n$$\n$#' );

      return;
    }

    console.debug( "<- " + inData );

    this.#callback( CONSOLE_DISPLAY, { mode:    'response', 
                                       message: inData } );

    // Process other data.

    if (inData.indexOf( 'ok' ) == 0)
    {
      // Send next queued item.

      if (this.#queueState == QUEUE_RUNNING) this.#transmitNextItem();

      // remove first

      this.#lastSerialWrite.shift();
    }
    else if (inData.indexOf( 'ALARM' ) == 0)
    {
      this.clearQueue();
      this.#machineStatus='Locked';
      this.#callbackMachineStatus()
    }

    // else if (inData.indexOf( 'error' ) == 0)
    // {
    //   // TODO -- Do we want to continue on error?
    // }
    else
    {
      this.clearQueue();
    }

    // Save the line.

    this.#lastSerialReadLine = inData;
  }

  // --------------------------------------------------------------------------
  // Private Method callback
  // --------------------------------------------------------------------------

  #callback( inMessage, inData )
  {
    this.#clients.forEach( ( aClient ) => 
    {
      aClient.callback( inMessage, inData, aClient.parameter );
    } );
  }

  // --------------------------------------------------------------------------
  // Private Method callbackMachineStatus
  // --------------------------------------------------------------------------
  //  This function sends the 'status' callback

  #callbackMachineStatus()
  {
    // Compute work coordinates from machine coordinates.

    const precision = (this.#displayIsInches) ? 4 : 3;

    let mpos = [this.#positionX.toFixed( precision ),
                this.#positionY.toFixed( precision ),
                this.#positionZ.toFixed( precision )];

    let wpos = [(this.#positionX - this.#wcoX).toFixed( precision ),
                (this.#positionY - this.#wcoY).toFixed( precision ),
                (this.#positionZ - this.#wcoZ).toFixed( precision )];

    this.#callback( MACHINE_STATE, { 'status'        : this.#machineStatus,
                                     'mpos'          : mpos,
                                     'wpos'          : wpos,
                                     'currentLength' : this.#queue.length,
                                     'currentMax'    : this.#queueCurrentMax,
                                     'queueState'    : this.#queueState,
                                     'inInches'      : this.#displayIsInches } );

      
    if (config.useJogger)
    {
      let isLocked =    this.#machineStatus != 'Jog'
                     && (   this.#queue.length > 0
                         || this.#machineStatus != 'Idle');
    
      jogger.updateMachineStatus( this.#positionX, 
                                  this.#positionY, 
                                  this.#positionZ,
                                  this.#displayIsInches,
                                  isLocked );
    }                             
  }

  // --------------------------------------------------------------------------
  // Private Method doCommands
  // --------------------------------------------------------------------------
  //  This function accepts a string with one or more commands (separated by
  //  new-line characters) and sends them to the connected device immediately.
  //
  //  This method should only be used to request status updates so that
  //  it does not interfere with queue processing.

  #doCommands( inCommands )
  {
    const theCommands = inCommands.split( "\n" );

    theCommands.forEach( ( aCommand ) =>
    {
      this.#serialPort.write( aCommand + "\n" );

      // Log the command to the console

      this.#callback( CONSOLE_DISPLAY, { mode:   'immediate', 
                                         message: aCommand } );
    } );
  }

}

