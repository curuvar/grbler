//     Grbler - a Node.js based CNC controller for GRBL
//
//     Copyright © 2022 Craig Altenburg
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
//     it under the terms of the GNU Affero General Public License as published by
//     the Free Software Foundation, either version 3 of the License.
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

var   gX               = 0.0;
var   gY               = 0.0;
var   gZ               = 0.0;

var   gDeltaX          = 0.0;
var   gDeltaY          = 0.0;
var   gDeltaZ          = 0.0;

var   gStepsX          = 0.0;
var   gStepsY          = 0.0;
var   gStepsZ          = 0.0;

var   gPrecision       = 3;

var   gOrigin          = 1;

var   gDisplayIsInches = false;

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
          // TODO - Update current coordinate by 'value'
          case 1: // Jog X
          case 2: // Jog Y
          case 3: // Jog Z
            break;
          
          case 4: // Update Home
            gCallback( 'change-coords', 'G' + (53 + gOrigin) );
            break;
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

        case 'Q1': // TODO - Update current coordinate by 'value'
          switch (gCurrentPage)
          {
          case 1: // Jog X
          case 2: // Jog Y
          case 3: // Jog Z
            break;
          
          case 4: // Update Home
            gOrigin = ((gOrigin + value - 1) % 6 + 6) % 6 + 1;
            break;
          }

          updateDisplay();
          
          break;
          
        case 'Q2': // TODO - Update current coordinate by '100 * value'
          switch (gCurrentPage)
          {
          case 1: // Jog X
          case 2: // Jog Y
          case 3: // Jog Z
            break;
          
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
//  Function updateDisplay
// ----------------------------------------------------------------------------

function updateDisplay()
{
  const precision = gDisplayIsInches ? 4 : 3;

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
    console.log( "set to jogger->", str );
  }
}

// ----------------------------------------------------------------------------
//  Function updateOrigin
// ----------------------------------------------------------------------------

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

export function updateMachineStatus( inX, 
                                     inY, 
                                     inZ, 
                                     inDisplayIsInches,
                                     inStatus,
                                     inQueueLength )
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

  if (inDisplayIsInches != gDisplayIsInches)
  {
    changed    = true;
    gDisplayIsInches = inDisplayIsInches;
  }

  gLocked =    inQueueLength != 0
            || inStatus      != 'Idle';

  if (gLocked)
  {
    gJoggerPort.write( "\u000E" );

    if (gCurrentPage != 0) changed = true;

    gSavedPage = gCurrentPage;
    gCurrentPage = 0;
  }
  else
  {
    gJoggerPort.write( "\u000F" );

    if (gSavedPage != 0)
    {
      gCurrentPage = gSavedPage;
      changed = true;
    }
  }

  if (changed)
  {
    updateDisplay();
  }
}

// ----------------------------------------------------------------------------
//  Function updateStepsX
// ----------------------------------------------------------------------------

export function updateStepsX( inSteps )
{
  gStepsX = inSteps;
}

// ----------------------------------------------------------------------------
//  Function updateStepsY
// ----------------------------------------------------------------------------

export function updateStepsY( inSteps )
{
  gStepsY = inSteps;
}

// ----------------------------------------------------------------------------
//  Function updateStepsZ
// ----------------------------------------------------------------------------

export function updateStepsZ( inSteps )
{
  gStepsZ = inSteps;
}
