//     Grbler - a Node.js based CNC controller for GRBL
//
//     Copyright © 2023 Craig Altenburg
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
//  Jogger API
// ============================================================================
//
// Jogger's initialize function must be passed a callback function.  This
// callback function must take two parameters: "command" and "data".  When
// called the "command" will be a string.  The "data" depends on the command
// passed.
//
// The defined commands are:
//
//     change-coords   - Change active coordinate system.
//                       Data parameter must be number 1 thru 6 (equivalent 
//                       to G54 through G59).
//
//     auto-home        - Perform and auto-home (or reset if no end-stops).
//                        Data parameter is ignored.
//
//     jog-x            - Jog X coordinate.
//                        Data is an integer interpreted as smallest move unit.
//
//     jog-y            - Jog Y coordinate.
//                        Data is an integer interpreted as smallest move unit.
//
//     jog-z            - Jog Z coordinate.
//                        Data is an integer interpreted as smallest move unit.
//
//     update-x         - Update indicated coordinate system's X to current position.
//                        Data parameter must be number 1 thru 6.
//
//     update-y         - Update indicated coordinate system's Y to current position.
//                        Data parameter must be number 1 thru 6.
//
//     update-z         - Update indicated coordinate system's Z to current position.
//                        Data parameter must be number 1 thru 6.
//
// Jogger itself defines a number of functions that will be called as
// appropriate.
//
//  updateOrigin  -- called when Grbler user changes coordinate system.
//
//      Parameters:
//           inOrigin  -- a selected origin number 1 through 6.
//
//  updateOffsets -- periodically passed the offsets between the machine 
//                   coordinates and the selected origin's coordinates.
//
//      Parameters:
//          inDeltaX   -- the X coordinates offset.
//          inDeltaY   -- the Y coordinates offset.
//          inDeltaZ   -- the Z coordinates offset.
//
//  updateMachineStatus -- called by Grbler when changes to status detected.
//
//      Parameters:
//          inX        -- the X machine coordinates.
//          inY        -- the Y machine coordinates.
//          inZ        -- the Z machine coordinates.
//          inIsInches -- Set true if coordinates are inches, of false for mm.
//          inLocked   -- True if Jogger must not change position.

// ============================================================================
//  Requirements
// ============================================================================

import SerialPort     from "serialport";

import { printf }     from "fast-printf";

import { config }     from "./config.js";

// ============================================================================
//  Global Storage
// ============================================================================

const gJoggerPort = new SerialPort( config.joggerPort, 
                                    { baudRate: config.joggerBaudRate } );

const gJoggerPipe = new SerialPort.parsers.Readline( { delimiter: '\n' } );

var   gCurrentPage     = 0;
var   gSavedPage       = 0;

var   gX               = 0.0;  // Machine Coordinates
var   gY               = 0.0;
var   gZ               = 0.0;

var   gDeltaX          = 0.0;
var   gDeltaY          = 0.0;
var   gDeltaZ          = 0.0;

var   gPrecision       = 3;

var   gOrigin          = 1;

var   gIsInches        = false;

var   gLocked          = true;

var   gCallback        = null;

// 0 Display X Y Z
// 1 Update X
// 2 Update Y
// 3 Update Z           
// 4 Select Coordinate System

// ----------------------------------------------------------------------------
//  Function initialize
// ----------------------------------------------------------------------------
// Set up communications with jogger.

export function initialize( inCallback )
{
  gCallback = inCallback;

  gJoggerPort.pipe( gJoggerPipe );
  
  gJoggerPipe.on( "data", ( inData ) =>
  {
    // processJoggerCommand( inData );
    console.log( "jogger sent->", inData );

    const parts = inData.split( ':' );

    const value = parseInt( parts[1] );

    if (!gLocked)
    {
      if (parts.length == 2)
      {
        switch (parts[0])
        {
        case 'LC':
          gCurrentPage = ((gCurrentPage - value) % 5 + 5) % 5;
          
          updateDisplay();

          break;

        case 'RC':          
          gCurrentPage = ((gCurrentPage + value) % 5 + 5) % 5;
          
          updateDisplay();

          break;

        case 'SC': // TODO lock in selected value
          switch (gCurrentPage)
          {
          case 1:  gCallback( 'update-x',      gOrigin ); break;
          case 2:  gCallback( 'update-y',      gOrigin ); break;
          case 3:  gCallback( 'update-z',      gOrigin ); break;
          case 4:  gCallback( 'change-coords', gOrigin ); break;
          }
          break;          

        case 'LH':
          gCurrentPage = 0;
                      
          updateDisplay();

          break;

        case 'RH':
          gCurrentPage = 4;
                      
          updateDisplay();

          break;

        case 'SH': // TODO -- perhaps zero (or maybe restore) current value
          if (value == 2)
          {
            gCallback( 'auto-home', '' );
          }
          break;

        case 'Q1':
          switch (gCurrentPage)
          {
          case 1: gCallback( 'jog-x', value ); break;
          case 2: gCallback( 'jog-y', value ); break;
          case 3: gCallback( 'jog-z', value ); break;
          
          case 4: // Update Home
            gOrigin = ((gOrigin + value - 1) % 6 + 6) % 6 + 1;
            break;
          }

          updateDisplay();
          
          break;
          
        case 'Q2':
          switch (gCurrentPage)
          {
          case 1: gCallback( 'jog-x', 100 * value ); break;
          case 2: gCallback( 'jog-y', 100 * value ); break;
          case 3: gCallback( 'jog-z', 100 * value ); break;
          
          case 4: // Update Home
          // (a%b + b)%b to make sure result is positive
            gOrigin = ((gOrigin + value - 1) % 6 + 6) % 6 + 1;
            break;
          }

          updateDisplay();

          break;
        }
      }
    }
    else
    {
      if (parts[0] == 'SH'  &&  value == 2)
      {
        gCallback( 'auto-home', '$H' );
      }
    }
  } );
}

// ----------------------------------------------------------------------------
//  Private Function updateDisplay
// ----------------------------------------------------------------------------

function updateDisplay()
{
  const precision = gIsInches ? 4 : 3;

  const x = (gX - gDeltaX).toFixed( precision );
  const y = (gY - gDeltaY).toFixed( precision );
  const z = (gZ - gDeltaZ).toFixed( precision );

  var   str = "";

  switch (gCurrentPage)
  {
  case 0:  // X Y Z display page
    str = printf( "ax%9s|by%9s|cz%9s|7Origin %d (G%d)\n",
                  x, y, z, gOrigin, gOrigin+53 );
    break;
    
  case 1:  // X modify page
    str = printf( "bx%9s|7Origin %d (G%d)\n",
                  x, gOrigin, gOrigin+53 );
    break;
    
  case 2:  // Y modify page
    str = printf( "by%9s|7Origin %d (G%d)\n",
                  y, gOrigin, gOrigin+53 );
    break;
    
  case 3:  // Z modify page
    str = printf( "bz%9s|7Origin %d (G%d)\n",
                   z, gOrigin, gOrigin+53 );
    break;
    
  case 4:  // Coordinate system select
    str = printf( "bOrigin %d|6            G%2d\n", 
                  gOrigin, gOrigin+53 );
    break;
  }

  if (str != "")
  {
    gJoggerPort.write( str );
    console.log( "sent to jogger->", str );
  }
}

// ----------------------------------------------------------------------------
//  Function updateOrigin
// ----------------------------------------------------------------------------
//  Called when Grbler user changes coordinate system.
//
//  Parameters:
//      inOrigin  -- a selected origin number 1 through 6.
//

export function updateOrigin( inOrigin )
{
  if (inOrigin != gOrigin)
  {
    gOrigin = inOrigin;
    updateDisplay();
  }
}

// ----------------------------------------------------------------------------
//  Function updateOffsets
// ----------------------------------------------------------------------------
//  Passed the offsets between the machine coordinates and the selected
//  origin's coordinates.
//
//  Parameters:
//      inDeltaX  -- the X coordinates offset.
//      inDeltaY  -- the Y coordinates offset.
//      inDeltaZ  -- the Z coordinates offset.
//

export function updateOffsets( inDeltaX, inDeltaY, inDeltaZ )
{
  let changed = false;

  if (inDeltaX != gDeltaX)
  {
    changed = true;
    gDeltaX = inDeltaX;
  }

  if (inDeltaY != gDeltaY)
  {
    changed = true;
    gDeltaY = inDeltaY;
  }

  if (inDeltaZ != gDeltaZ)
  {
    changed = true;
    gDeltaZ = inDeltaZ;
  }

  if (changed)
  {
    updateDisplay();
  }
}

// ----------------------------------------------------------------------------
//  Function updateMachineStatus
// ----------------------------------------------------------------------------
//  Passed the offsets between the machine coordinates and the selected
//  origin's coordinates.
//
//  Parameters:
//      inX        -- the X machine coordinates.
//      inY        -- the Y machine coordinates.
//      inZ        -- the Z machine coordinates.
//      inIsInches -- Set true if coordinates are inches, of false for mm.
//      inLocked   -- True if Jogger control of Grbler is disabled.

export function updateMachineStatus( inX, 
                                     inY, 
                                     inZ, 
                                     inIsInches,
                                     isLocked )
{
  let changed = false;

  if (inX != gX)
  {
    changed = true;
    gX = inX;
  }

  if (inY != gY)
  {
    changed = true;
    gY = inY;
  }

  if (inZ != gZ)
  {
    changed = true;
    gZ = inZ;
  }

  if (inIsInches != gIsInches)
  {
    changed   = true;
    gIsInches = inIsInches;
  }

  if (isLocked)
  {
    gJoggerPort.write( "\u000E" );
  }
  else
  {
    gJoggerPort.write( "\u000F" );
  }

  if (isLocked != gLocked)
  {
    gLocked = isLocked;
    
    if (isLocked)
    {
      gSavedPage   = gCurrentPage;
      gCurrentPage = 0;
    }
    else
    {
      gCurrentPage = gSavedPage;
    }

    changed = true;
  }

  if (changed)
  {
    updateDisplay();
  }
}
