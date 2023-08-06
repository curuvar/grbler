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

export const config = {};  // Do not change this line

// ============================================================================
//  Use Configurable Items
// ============================================================================
// The following values can be changed to reflect your desired configuration.

config.webPort        = 8000;           // Web port that Grbler listens to.

config.serialPort     = "/dev/ttyUSB0"; // Serial Port for GRBL device.
config.serialBaudRate = 115200;         // Baud rate used to connect to GRBL device.

// ----------------------------------------------------------------------------
//  Jogger Configuration
// ----------------------------------------------------------------------------
// Jogger is an AVR based module that allow the user to position the tool
// and set the offset for the various origins supported by grbl.

config.useJogger      = true;           // Set true to add Jogger support.
config.joggerPort     = "/dev/ttyAMA0"; // Serial Port for Jogger device.
config.joggerBaudRate = 19200;          // Baud rate used to connect to Jogger.

// ----------------------------------------------------------------------------
//  Webcam Support
// ----------------------------------------------------------------------------

// Set following string to url for webcam video or set to empty string
// for no webcam.    eg: 'http://127.0.0.1/webcam/?action=stream'
config.webcamVideoURL = 'http://octopi.lan/webcam/?action=stream';

// Set following string to url for webcam snapshot or set to empty string
// for no webcam.    eg: 'http://127.0.0.1/webcam/?action=snapshot'
config.webcamStillURL = 'http://octopi.lan/webcam/?action=snapshot';

// ----------------------------------------------------------------------------
//  Additional Command Buttons
// ----------------------------------------------------------------------------
// menuCommands is an array of items defining additional command button.
// Each item is an array of two strings.  The first string is used as
// the label for the button; the second for the GCode to send when
// the button is clicked. To send multiple GCodes, separate them with
// a semicolon.

config.cmdButtons =
[
  [ "Out & Back",  "G0X100Y100;X0Y0" ]
];


