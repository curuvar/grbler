/*
    NodeGRBL - a Node.js based CNC controller for GRBL

		Copyright (C) 2022 Craig Altenburg

    Based on GrblWeb, Copyright (C) 2021 Andrew Hodel

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
    WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
    MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
    ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
    WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
    ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
    OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

*/
const STOPPED            = 0;       // queue state stopped -- nothing to do
const RUNNING            = 1;       // queue state running
const PAUSED             = 2;       // queue state temporary pause

const OS_OTHER           = 0;
const OS_MAC             = 1;
const OS_WINDOWS         = 2;
const OS_LINUX           = 3;
const OS_UNIX            = 4;

const SETTING_NUMBER     = 0;
const SETTING_BOOL       = 1;
const SETTING_MASK       = 2;
const SETTING_RO         = 3


const GRBL_SETTING       = {
                            $0:   [SETTING_NUMBER, "Step pulse (µs)"],
                            $1:   [SETTING_NUMBER, "Step idle delay (ms)"],
                            $2:   [SETTING_MASK,   "Step port invert"],
                            $3:   [SETTING_MASK,   "Direction port invert"],
                            $4:   [SETTING_BOOL,   "Step enable invert"],
                            $5:   [SETTING_BOOL,   "Limit pins invert"],
                            $6:   [SETTING_BOOL,   "Probe pin invert"],
                            $10:  [SETTING_RO,     "Status report mode"],
                            $11:  [SETTING_NUMBER, "Junction deviation (mm)"],
                            $12:  [SETTING_NUMBER, "Arc tolerance (mm)"],
                            $13:  [SETTING_BOOL,   "Report in inches"],
                            $20:  [SETTING_BOOL,   "Soft limits enable"],
                            $21:  [SETTING_BOOL,   "Hard limits enable"],
                            $22:  [SETTING_BOOL,   "Homing cycle enable"],
                            $23:  [SETTING_MASK,   "Homing direction invert"],
                            $24:  [SETTING_NUMBER, "Homing feed (mm/min)"],
                            $25:  [SETTING_NUMBER, "Homing seek (mm/min)"],
                            $26:  [SETTING_NUMBER, "Homing debounce (ms)"],
                            $27:  [SETTING_NUMBER, "Homing pull-off (mm)"],
                            $30:  [SETTING_NUMBER, "Max spindle speed (rpm)"],
                            $31:  [SETTING_NUMBER, "Min spindle speed (rpm)"],
                            $32:  [SETTING_BOOL,   "Laser mode enable"],
                            $100: [SETTING_NUMBER, "X steps per mm"],
                            $101: [SETTING_NUMBER, "Y steps per mm"],
                            $102: [SETTING_NUMBER, "Z steps per mm"],
                            $110: [SETTING_NUMBER, "X Max rate (mm/min)"],
                            $111: [SETTING_NUMBER, "Y Max rate (mm/min)"],
                            $112: [SETTING_NUMBER, "Z Max rate (mm/min)"],
                            $120: [SETTING_NUMBER, "X Acceleration (mm/sec²)"],
                            $121: [SETTING_NUMBER, "Y Acceleration (mm/sec²)"],
                            $122: [SETTING_NUMBER, "Z Acceleration (mm/sec²)"],
                            $130: [SETTING_NUMBER, "X Max travel (mm)"],
                            $131: [SETTING_NUMBER, "Y Max travel (mm)"],
                            $132: [SETTING_NUMBER, "Z Max travel (mm)"]
                           };

// ============================================================================
//  Global Variables
// ============================================================================

const gSocket              = io.connect( '' );

let   clientOS             = OS_OTHER;

const gGCodeSettings        = {};
let   gGCodeSettingsChanged = false;

const gGrblSettings        = {};
let   gGrblSettingsChanged = false;

let   gQueueState          = STOPPED;

let   gValidFileTypes      = '.gcode,text/x.gcode,text/x-gcode';

let   gDisplayIsInches     = false;
let   gHasLimitSwitch      = true;

let   gCurrentMachineX    = 0;
let   gCurrentMachineY    = 0;
let   gCurrentMachineZ    = 0;

let   gMaxTravelX          = 0;
let   gMaxTravelY          = 0;
let   gMaxTravelZ          = 0;

// ============================================================================
//  Our Functions
// ============================================================================

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

// ----------------------------------------------------------------------------
//  Function showModal
// ----------------------------------------------------------------------------

function showModal( inTarget )
{
  document.getElementById( inTarget ).style.display = "block";
}

// ----------------------------------------------------------------------------
//  Function hideModal
// ----------------------------------------------------------------------------

function hideModal( inTarget )
{
  document.getElementById( inTarget ).style.display = "none";
}

// ----------------------------------------------------------------------------
//  Function selectTab
// ----------------------------------------------------------------------------

function selectTab( inTab )
{
  // Get all elements with class="tabcontent" and hide them

  const tabcontent = document.getElementsByClassName( "tabcontent" );

  for (let i = 0; i < tabcontent.length; i++)
  {
    tabcontent[i].style.display = "none";
  }

// Get all elements with class="tablinks" and remove the class "active"

  const tablinks = document.getElementsByClassName( "tablinks" );

  for (let i = 0; i < tablinks.length; i++)
  {
    tablinks[i].className = tablinks[i].className.replace( " active", "" );
  }

  // Show the current tab, and add an "active" class to the button that opened the tab

  document.getElementById( "tab-page-" + inTab ).style.display = "block";

  document.getElementById( "tab-" + inTab ).className += " active";
}

// ----------------------------------------------------------------------------
//  Function checkGCodeSettings
// ----------------------------------------------------------------------------

function checkGCodeSettings()
{
	var changed  = false;
	var error    = false;

	for (const [a, b] of  Object.entries( gGCodeSettings ))
  {
    let theInput = $('input[name="' + a + '"]');

		if (theInput.attr('readonly') != 'readonly')
		{
			let theValue      =  theInput.val();
			let theCoordinate =  a.charAt( 3 );

			var maxTravel;

			switch (a.charAt( 3 ))
			{
				case 'x': maxTravel = gMaxTravelX; break;
				case 'y': maxTravel = gMaxTravelY; break;
				case 'z': maxTravel = gMaxTravelZ; break;
				default:  maxTravel = 0;           break;
			}

			if (   theValue.match( /^-?[0-9]*\.?[0-9]*$/ )
			    && (   maxTravel == 0
						  || (   Number( theValue ) <= 0
					        && Number( theValue ) >= -maxTravel)))
			{
				theInput.css( "background-color", "white" );
				theInput.css( "color", "black" );

				if (Number( theValue ) != Number( b ))
				{
					changed = true;
				}
			}
			else
			{
				theInput.css( "background-color", "red" );
				theInput.css( "color", "white" );

				error = true;
			}
		}
	}

	if (error)
	{
		$('#gcode-settings-msg').text( "Invalid field value." );
	}
	else
	{
		$('#gcode-settings-msg').text( "Changes lost if tab closed without committing." );
	}

	if (changed  &&  !error)
	{
		$('#btn-commit-gcode-settings').prop( 'disabled', false );
		$('#btn-revert-gcode-settings').prop( 'disabled', false );
	}
	else
	{
		$('#btn-commit-gcode-settings').prop( 'disabled', true );
		$('#btn-revert-gcode-settings').prop( 'disabled', true );
	}
}

// ----------------------------------------------------------------------------
//  Function buildGrblSettings
// ----------------------------------------------------------------------------

function buildGrblSettings()
{  const theSettings = $('#table-grbl-settings');

let html  = "<colgroup>";
html += "<col style='width: 50px'>";
html += "<col style='width: 400px'>";
html += "<col style='width: 80px'>";
html += "</colgroup><tr><th>Setting</th><th>Usage</th><th>Value</th></tr>";

let bg2nd = false;

for (const [a, b] of  Object.entries( gGrblSettings ))
{
	if (bg2nd)
	{
		html += "<tr class='tr-light'><th>";
	}
	else
	{
		html += "<tr><th>";
	}

	bg2nd = !bg2nd;

	html += a;
	html += "</th><td class='grbl-settings-desc'>";
	html += GRBL_SETTING[a][1];
	html += "</td>";

	switch (GRBL_SETTING[a][0])
	{
	case SETTING_RO:
		html += "<td><input type='text' class='grbl-setting' readonly='readonly' name='";
		html += a;
		html += "' value='";
		html += b;
		html += "' \></td>";
		break;

	case SETTING_BOOL:
		html += "<td class='row' style='justify-content: space-around'>";
		html += "<input type='checkbox' class='grbl-setting-bool' name='";
		html += a;
		html += "'";
		if (b != 0) html += "checked ";
		html += "' \></td>";
		break;

	case SETTING_MASK:
		html += "<td class='row' style='justify-content: space-between'>";
		html += "<span>x<input type='checkbox' class='grbl-setting-mask' name='";
		html += a;
		html += "-x' value='1'";
		if (b & 1) html += "checked ";
		html += "' \></span>";
		html += "<span>y<input type='checkbox' class='grbl-setting-mask' name='";
		html += a;
		html += "-y' value='2'";
		if (b & 2) html += "checked ";
		html += "' \></span>";
		html += "<span>z<input type='checkbox' class='grbl-setting-mask' name='";
		html += a;
		html += "-z' value='4'";
		if (b & 4) html += "checked ";
		html += "' \></span></td>";
		break;

	default:
		html += "<td><input type='text' class='grbl-setting' name='";
		html += a;
		html += "' value='";
		html += b;
		html += "' \></td>";
	}

	html += "</tr>";
}

html += "<tr><td colspan='3'>"
html += "<div class='row-reverse' style='white-space: nowrap; justify-content: space-between;'>";
html += "<button type='button' id='btn-commit-grbl-settings' class='btn' >";
html += "	Commit Changes </button>";
html += "<p id='grbl-settings-msg'>Changes lost if tab closed without committing.</p>";
html += "<button type='button' id='btn-revert-grbl-settings' class='btn btn-red' >";
html += "	Revert </button></div></td></tr>";

	theSettings.html( html );

	$('#btn-commit-grbl-settings').prop( 'disabled', true );
	$('#btn-revert-grbl-settings').prop( 'disabled', true );

  $('#grbl-settings-msg').text( "Changes lost if tab closed without committing." );

	// Note to self -- we need to do the following here because
	//                 setting the "on" property only effects 
	//                 existing object.  When we rebuild the
	//                 settings the new settings will not have
	//                 the "on" property set.

	$('.grbl-setting').on( 'input', ( inEvent ) =>
	{
		checkGRBLSettings();
	} );
	
	$('.grbl-setting-bool').on( 'click', ( inEvent ) =>
	{
		checkGRBLSettings();
	} );
	
	$('.grbl-setting-mask').on( 'click', ( inEvent ) =>
	{
		checkGRBLSettings();
	} );

	$('#btn-commit-grbl-settings').on( 'click', ( inEvent ) =>
	{
		let theCommand = '';
		let isError    = false;

		for (const [a, b] of  Object.entries( gGrblSettings ))
		{
			let theValue = b;

			switch (GRBL_SETTING[a][0])
			{
			case SETTING_NUMBER:
				let theInput = $('input[name="' + a + '"]');
				theValue =  theInput.val();
				break;

			case SETTING_BOOL:
				theValue = $('input[name="' + a + '"]').is(':checked') ? 1 : 0;
				break;

			case SETTING_MASK:
				theValue  = $('input[name="' + a + '-x"]').is(':checked')  ? 1 : 0;
				theValue += $('input[name="' + a + '-y"]').is(':checked')  ? 2 : 0;
				theValue += $('input[name="' + a + '-z"]').is(':checked')  ? 4 : 0;
				break;
			}

			if (theValue != b)
			{
				theCommand += a + "=" + theValue + "\n";
			}
		}
		if (!isError)
		{
			if (theCommand != '')
			{
				gSocket.emit( 'queue-to-grbl', { line: theCommand } );
				gSocket.emit( 'request-grbl-settings', {} );
			}

			$('#grbl-settings-msg').text( "Changes lost if tab closed without committing." );
		}
	} );

	$('#btn-revert-grbl-settings').on( 'click', ( inEvent ) =>
	{
		gSocket.emit( 'request-grbl-settings', {} );
	} );
}

// ----------------------------------------------------------------------------
//  Function checkGRBLSettings
// ----------------------------------------------------------------------------

function checkGRBLSettings()
{
	var changed  = false;
	var error    = false;

	for (const [a, b] of  Object.entries( gGrblSettings ))
  {
		let theValue = b;

		switch (GRBL_SETTING[a][0])
		{
		case SETTING_NUMBER:
      let theInput = $('input[name="' + a + '"]');

			if (theInput.attr('readonly') != 'readonly')
			{
				theValue =  theInput.val();

				if (theValue.match( /^[0-9]*\.?[0-9]*$/ ))
				{
					theInput.css( "background-color", "white" );
					theInput.css( "color", "black" );
				}
				else
				{
					theInput.css( "background-color", "red" );
					theInput.css( "color", "white" );
					error = true;
				}
			}
			break;

    case SETTING_BOOL:
			theValue = $('input[name="' + a + '"]').is(':checked') ? 1 : 0;
			break;

		case SETTING_MASK:
			theValue  = $('input[name="' + a + '-x"]').is(':checked')  ? 1 : 0;
			theValue += $('input[name="' + a + '-y"]').is(':checked')  ? 2 : 0;
			theValue += $('input[name="' + a + '-z"]').is(':checked')  ? 4 : 0;
			break;
		}

		if (Number( theValue ) != Number( b ))
		{
			changed = true;
		}
	}

	if (error)
	{
		$('#grbl-settings-msg').text( "Invalid field value." );
	}
	else
	{
		$('#grbl-settings-msg').text( "Changes lost if tab closed without committing." );
	}

	if (changed  &&  !error)
	{
		$('#btn-commit-grbl-settings').prop( 'disabled', false );
		$('#btn-revert-grbl-settings').prop( 'disabled', false );
	}
	else
	{
		$('#btn-commit-grbl-settings').prop( 'disabled', true );
		$('#btn-revert-grbl-settings').prop( 'disabled', true );
	}
}

// ============================================================================
//  Initialization on document load.
// ============================================================================

$(document).ready( () =>
{
  // let isMouseDown        = false;

  // let tsLast           = Date.now();

	// // get dimensions for better controls

	// let betterWidth   = $('#betterControls').width();
	// let betterHeight  = $('#betterControls').height();
	// let bPointWidth   = $('#betterControlsPoint').width();
	// let bPointHeight  = $('#betterControlsPoint').height();

	// // track the control mouse position externally

	// let betterX       = 0;
	// let betterY       = 0;

	// // get the scale factor to reduce x and y to a resolution of -1 to 1

	// let xSf           = 2 / betterWidth;
	// let ySf           = 2 / betterHeight;

	// ============================================================================
	//  Server Event Responders
	// ============================================================================

	// ----------------------------------------------------------------------------
	//  On server-error message
	// ----------------------------------------------------------------------------
	//	Display an alert message sent from the server.

	gSocket.on( 'server-error', ( inData ) =>
	{
		alert( inData );
	});

	// ----------------------------------------------------------------------------
	//  On load-gcode message
	// ----------------------------------------------------------------------------
	//	Populate the console-input panel with g-code sent from the server,
	//  usually from JSCut.

	gSocket.on( 'load-gcode', ( inData ) =>
	{
    const gcode = inData.val;

		$('#console-input').val( gcode );

		openGCodeFromText( gcode );
	});

	// ----------------------------------------------------------------------------
	//  On config message
	// ----------------------------------------------------------------------------
	//	Handle the data from the config.js file sent over from the server.

  gSocket.on( 'config', ( inData ) =>
  {
    // console.log( 'config data:', inData );

    // Enable the webcam view, if defined

    if (inData.webcamVideoURL != '')
    {
      $('#wcImg').attr( 'src', inData.webcamVideoURL );

      $('#wcLink').attr( 'href', inData.webcamStillURL );

      $('#webcam').css( 'display','inline-block' );
    }

    // Update the extra command buttons.

    const cmdButtons = inData.cmdButtons;

    console.log( 'add user buttons:', cmdButtons );

    if (Array.isArray( cmdButtons )  &&  cmdButtons.length > 0)
    {
      let buttonHTML = '';

      cmdButtons.forEach( aButton =>
      {
        if (   Array.isArray( aButton )
            && aButton.length >= 2
            && typeof (aButton[0]) === 'string'
            && typeof (aButton[1]) === 'string' )
        {
          console.log( 'add item:', aButton[0], "as", aButton[1] );

					let gcode = aButton[1].replace( /;/g, '\\n' );

          buttonHTML +=   "<button class='btn status-btn user-command-btn' "
					              + "roll='button' onclick=' gSocket.emit( "
												+ "\"queue-to-grbl\", { line: \""
						  					+ gcode
												+ "\" } )'>"
												+ htmlEncode( aButton[0] )
												+ "</button>";
				}
			} );

			console.log( 'add html:', buttonHTML );

			$('#user-buttons').html( buttonHTML );

			// If no limit switches change "Auto Home" button to "Unlock" ($X)

			gHasLimitSwitch = (inData.hasLimitSwitch == '1');

			if (!gHasLimitSwitch)
			{
				$('#auto-home-btn').html( 'Unlock' );
				$('#auto-home-btn').prop( 'title', 'Send "$X" to unlock machine.' );
			}
    }
  } );

	// ----------------------------------------------------------------------------
	//  On machine-status message
	// ----------------------------------------------------------------------------
	// This handles the machine status data sent by GRBL in response to the '?'
	// command.  The server sends this message about once per second.
	//
  //	Update the queue status display and the pause and clear-queue buttons.
	//	This data is sent by the server when a serial port is selected and when
	//  queue items are added or removed.

	// We also use this to do anything that needs to be done periodically.

	gSocket.on( 'machine-status', ( inData ) =>
	{
		const statusValue = $('#status-value');

		$('#mX').html( inData.mpos[0] );
		$('#mY').html( inData.mpos[1] );
		$('#mZ').html( inData.mpos[2] );
		$('#wX').html( inData.wpos[0] );
		$('#wY').html( inData.wpos[1] );
		$('#wZ').html( inData.wpos[2] );

		gCurrentMachineX = inData.mpos[0];
		gCurrentMachineY = inData.mpos[1];
		gCurrentMachineZ = inData.mpos[2];

		gDisplayIsInches = inData.inInches == '1';

		$('.position-units-text').html(gDisplayIsInches ? "inch" : "mm" );

		let theStatus = inData.status;

		gQueueState = inData.queueState;

		if (theStatus == 'Alarm'  ||  theStatus == 'Locked')
		{
			statusValue.css( "background-color","red" );
			statusValue.css( "color","white" );
		}
		else if (theStatus == 'Run')
		{
			statusValue.css( "background-color","blue" );
			statusValue.css( "color","white" );
			theStatus = 'Running';
		}
		else if (gQueueState == PAUSED)
		{
			statusValue.css( "background-color","yellow" );
			statusValue.css( "color","black" );
			theStatus = "Queue Paused";
		}
		else if (gQueueState == STOPPED && inData.currentLength > 0)
		{
			statusValue.css( "background-color","yellow" );
			statusValue.css( "color","black" );
			theStatus = "Queue Error";
		}
		else if (gQueueState == RUNNING)
		{
			statusValue.css( "background-color","gray" );
			statusValue.css( "color","black" );
			theStatus = "Queue Running";
		}
		else
		{
			statusValue.css( "background-color","gray" );
			statusValue.css( "color","black" );
		}

		statusValue.html( theStatus );

		// Update queue-status field

		if (inData.currentLength > 0)
		{
			$('#queue-status').html(   inData.currentLength
                               + ' / '
                               + inData.currentMax );
		}
		else
		{
			$('#queue-status').html( 'Queue Empty' );
		}

		switch (gQueueState)
		{
	  case STOPPED:
	    $('#pause-queue-btn').html( 'Pause Queue' );
	    $('#pause-queue-btn').prop( 'disabled', true );
	    $('#clear-queue-btn').prop( 'disabled', true );
	    break;

	  case RUNNING:
	    $('#pause-queue-btn').html( 'Pause Queue' );
	    $('#pause-queue-btn').prop( 'disabled', false );
	    $('#clear-queue-btn').prop( 'disabled', true );
	    break;

	  case PAUSED:
	    $('#pause-queue-btn').html( 'Resume Queue' );
	    $('#pause-queue-btn').prop( 'disabled', false );
	    $('#clear-queue-btn').prop( 'disabled', false );
	    break;
		}

		// --- Other periodic stuff --------

		// Switch to the gcode tab.

		if (gGCodeSettingsChanged)
		{
			gGCodeSettingsChanged = false;

      const allGcodeSettings = $('.gcode-setting');

			checkGCodeSettings();

			$('#btn-commit-gcode-settings').prop( 'disabled', true );
			$('#btn-revert-gcode-settings').prop( 'disabled', true );

			$('#gcode-settings-msg').text( "Changes lost if tab closed without committing." );
		}

		// Rebuild the GRBL Settings table if the settings
		// have changed.

		if (gGrblSettingsChanged)
		{
			gGrblSettingsChanged = false;

			buildGrblSettings();

      $('#grbl-settings-msg').text( "Changes lost if tab closed without committing." );
		}
	} );

	// ----------------------------------------------------------------------------
	//  On grbl-setting message
	// ----------------------------------------------------------------------------

	gSocket.on( 'grbl-setting', ( inData ) =>
	{
		gGrblSettings[inData.setting] = inData.value;

		// We expect a bunch of settings, so we'll
		// defer updating our tables until the next
		// machine-status update.

		gGrblSettingsChanged = true;

		// Some settings need special handling

		switch (inData.setting)
		{
		case '$32':  // Laser mode
			console.debug( 'Update choose-mode to ' + inData.value );

			$('#choose-mode').val( inData.value );
		  break;

		case '$100':  // X steps per mm
			// TODO -- tell jogger
			break;

		case '$101':  // Y steps per mm
			// TODO -- tell jogger
			break;
		
		case '$102':  // Z steps per mm
			// TODO -- tell jogger
			break;

		case '$130':  // X Max Travel
			gMaxTravelX = Number( inData.value );
			break;

		case '$131':  // Y Max Travel
		  gMaxTravelY = Number( inData.value );
		  break;
		
		case '$132':  // Z Max Travel
		  gMaxTravelZ = Number( inData.value );
		  break;

		}
	} );

	// ----------------------------------------------------------------------------
	//  On gcode-parameters message
	// ----------------------------------------------------------------------------

	gSocket.on( 'gcode-parameters', ( inData ) =>
	{
		switch (inData.setting)
		{
		case 'G54':
			console.debug( "Update G54" );
			$('input[name="g54x"]').val( inData.xValue );
			$('input[name="g54y"]').val( inData.yValue );
			$('input[name="g54z"]').val( inData.zValue );
      gGCodeSettings["g54x"] = inData.xValue;
      gGCodeSettings["g54y"] = inData.yValue;
      gGCodeSettings["g54z"] = inData.zValue;
			break;

		case 'G55':
			$('input[name="g55x"]').val( inData.xValue );
			$('input[name="g55y"]').val( inData.yValue );
			$('input[name="g55z"]').val( inData.zValue );
      gGCodeSettings["g55x"] = inData.xValue;
      gGCodeSettings["g55y"] = inData.yValue;
      gGCodeSettings["g55z"] = inData.zValue;
			break;

		case 'G56':
			$('input[name="g56x"]').val( inData.xValue );
			$('input[name="g56y"]').val( inData.yValue );
			$('input[name="g56z"]').val( inData.zValue );
      gGCodeSettings["g56x"] = inData.xValue;
      gGCodeSettings["g56y"] = inData.yValue;
      gGCodeSettings["g56z"] = inData.zValue;
			break;

		case 'G57':
			$('input[name="g57x"]').val( inData.xValue );
			$('input[name="g57y"]').val( inData.yValue );
			$('input[name="g57z"]').val( inData.zValue );
      gGCodeSettings["g57x"] = inData.xValue;
      gGCodeSettings["g57y"] = inData.yValue;
      gGCodeSettings["g57z"] = inData.zValue;
			break;

		case 'G58':
			$('input[name="g58x"]').val( inData.xValue );
			$('input[name="g58y"]').val( inData.yValue );
			$('input[name="g58z"]').val( inData.zValue );
      gGCodeSettings["g58x"] = inData.xValue;
      gGCodeSettings["g58y"] = inData.yValue;
      gGCodeSettings["g58z"] = inData.zValue;
			break;

		case 'G59':
			$('input[name="g59x"]').val( inData.xValue );
			$('input[name="g59y"]').val( inData.yValue );
			$('input[name="g59z"]').val( inData.zValue );
      gGCodeSettings["g59x"] = inData.xValue;
      gGCodeSettings["g59y"] = inData.yValue;
      gGCodeSettings["g59z"] = inData.zValue;
			break;

		case 'G28':
			$('input[name="g28x"]').val( inData.xValue );
			$('input[name="g28y"]').val( inData.yValue );
			$('input[name="g28z"]').val( inData.zValue );
      gGCodeSettings["g28x"] = inData.xValue;
      gGCodeSettings["g28y"] = inData.yValue;
      gGCodeSettings["g28z"] = inData.zValue;
			break;

		case 'G30':
			$('input[name="g30x"]').val( inData.xValue );
			$('input[name="g30y"]').val( inData.yValue );
			$('input[name="g30z"]').val( inData.zValue );
      gGCodeSettings["g30x"] = inData.xValue;
      gGCodeSettings["g30y"] = inData.yValue;
      gGCodeSettings["g30z"] = inData.zValue;
			break;

		case 'G92':
			$('input[name="g92x"]').val( inData.xValue );
			$('input[name="g92y"]').val( inData.yValue );
			$('input[name="g92z"]').val( inData.zValue );
      gGCodeSettings["g92x"] = inData.xValue;
      gGCodeSettings["g92y"] = inData.yValue;
      gGCodeSettings["g92z"] = inData.zValue;
			break;

		case 'TLO':
			$('input[name="tlo-len"]').val( inData.xValue );
      gGCodeSettings["tlo-len"] = inData.xValue;
			break;

		case 'PRB':
			$('input[name="prbx"]').val( inData.xValue );
			$('input[name="prby"]').val( inData.yValue );
			$('input[name="prbz"]').val( inData.zValue );
			$('input[name="prbo"]').val( inData.other );
      gGCodeSettings["prbx"] = inData.xValue;
      gGCodeSettings["prby"] = inData.yValue;
      gGCodeSettings["prbz"] = inData.zValue;
      gGCodeSettings["prbo"] = inData.other;
	break;
		}

    gGCodeSettingsChanged = true;
	} );

	// ----------------------------------------------------------------------------
	//  On gcode-mode message
	// ----------------------------------------------------------------------------

	gSocket.on( 'gcode-mode', ( inData ) =>
	{
		console.debug( 'moveType',     inData.moveType );
		console.debug( 'origin',       inData.origin );
		console.debug( 'arcs',         inData.arcs );
		console.debug( 'useInch',      inData.useInch );
		console.debug( 'absolute',     inData.absolute );
		console.debug( 'motionMode',   inData.motionMode );
		console.debug( 'spindleStop',  inData.spindleStop );
		console.debug( 'coolantOn',    inData.coolantOn );
		console.debug( 'toolOffset',   inData.toolOffset );
		console.debug( 'feedRate',     inData.feedRate );
		console.debug( 'spindleSpeed', inData.spindleSpeed );

		$('input[name="gcode-origin"]').val( ['g' + inData.origin] );

} );

	// ----------------------------------------------------------------------------
	//  On console-display message
	// ----------------------------------------------------------------------------

	gSocket.on( 'console-display', ( inData ) =>
	{
		console.log( inData );

		if ($('#console p').length > 300)
		{
			// remove oldest if already at 300 lines
			$('#console p').first().remove();
		}

    const mode    = inData.mode;
    const message = inData.message;
		const display = $('#console-display');

    switch (mode)
    {
      case 'command':
        display.append(   '<p class="sent-command">'
                         + '———&gt; '
                         + message
                         + '</p>' );
        break;

			case 'immediate':
				display.append(   '<p class="immediate-command">'
													+ '---&gt; '
													+ message
													+ '</p>' );
				break;
	
      case 'response':
      {
        let theClass = 'resp-other';

        if (message.indexOf( 'ok' ) == 0)
        {
          theClass = 'resp-ok';
        }
        else if (   message.indexOf( 'error' ) == 0  
				         || message.indexOf( 'ALARM' ) == 0)
        {
          theClass = 'resp-error';
        }

				console.log( "<-" + message );

        display.append(   '<p class="'
                         + theClass
                         + '">'
                         + message
                         + '</p>' );
        break;
      }
    }

		display.scrollTop( display[0].scrollHeight - display.height() );
	} );

	// ============================================================================
	//  User Interface Actions
	// ============================================================================

	// ----------------------------------------------------------------------------
	//  On pause-queue-btn click
	// ----------------------------------------------------------------------------
	// This action is also used for resume.

	$('#pause-queue-btn').on( 'click', () =>
	{
		gSocket.emit( 'pause-queue', gQueueState != PAUSED );
	} );

	// ----------------------------------------------------------------------------
	//  On clear-queue-btn click
	// ----------------------------------------------------------------------------

	$('#clear-queue-btn').on( 'click', () =>
	{
		console.debug( "clear-queue-btn clicked" );

		if (gQueueState == PAUSED)
		{
			// if paused let user clear the command queue
			gSocket.emit( 'clear-queue', 1 );
			// must clear queue first, then unpause
			// because unpause does a sendQueuedItem on server
			gSocket.emit( 'pause', 0 );
		}
	} );

	// ----------------------------------------------------------------------------
	//  On auto-home-btn click
	// ----------------------------------------------------------------------------

	$('#auto-home-btn').on( 'click', () =>
	{
		gSocket.emit( 'send-to-grbl', { line: gHasLimitSwitch ? "$H" : "$X" } );
		$('#status-value').html( 'Homing' );
	} );

	// ----------------------------------------------------------------------------
	//  On clear-queue-btn click
	// ----------------------------------------------------------------------------

	$('#reset-btn').on( 'click', () =>
	{
		gSocket.emit( 'do-reset', {} );
	} );

	// ----------------------------------------------------------------------------
	//  On jscut-btn click
	// ----------------------------------------------------------------------------

	$('#jscut-btn').on( 'click', () =>
  {
    window.open( '/jscut/jscut.html', '_blank' );
    return false;
  } );

	// ----------------------------------------------------------------------------
	//  On choose-file-btn click
	// ----------------------------------------------------------------------------

  $('#choose-file-btn').on( 'click', ( inEvent ) =>
  {
    const input = document.createElement( 'input' );

    input.type = 'file';

    input.accept = gValidFileTypes;

    input.addEventListener( 'change', e =>
    {
      // getting a hold of the file reference
      const file = e.target.files[0];

      // setting up the reader
      const reader = new FileReader();

      reader.onloadend = readerEvent =>
      {
        const gcode = readerEvent.target.result;

        $('#console-input').val( gcode );

        openGCodeFromText( gcode );
      };

      reader.readAsText( file, 'UTF-8' );
    } );

    input.click();
  } );

	// ----------------------------------------------------------------------------
	//  On choose-mode change
	// ----------------------------------------------------------------------------

	$('#choose-mode').on( 'change', () =>
	{
		const value = $('#choose-mode').val();

		console.debug( "choose-mode changed to " + value );

		gSocket.emit( 'queue-to-grbl', { line: "$32=" + value } );

	} );

	// ----------------------------------------------------------------------------
	//  On send-gcode-btn click
	// ----------------------------------------------------------------------------

	$('#send-gcode-btn').on( 'click', () =>
	{
		const value = $('#console-input').val();

		console.debug( "send-gcode-btn clicked", value );

		gSocket.emit( 'queue-to-grbl', { line: value } );

		$('#console-input').val( '' );
	} );

  // ----------------------------------------------------------------------------
  //  Jog Control Actions
  // ----------------------------------------------------------------------------

	$('#mpC').on('click', function() {
		$('#mpA').addClass('active');
		$('#wpA').removeClass('active');
		$('#mPosition').show();
		$('#wPosition').hide();
	});

	$('#wpC').on('click', function() {
		$('#wpA').addClass('active');
		$('#mpA').removeClass('active');
		$('#wPosition').show();
		$('#mPosition').hide();
	});

	$('#sendZero').on('click', function() {
		gSocket.emit('queue-to-grbl', { line: 'G92 X0 Y0 Z0' });
	});

	$('#xM').on('click', function() {
		gSocket.emit('queue-to-grbl', { line: 'G91\nG1 F'+$('#jogSpeed').val()+' X-'+$('#jogSize').val()+'\nG90'});
	});

	$('#xP').on('click', function() {
		gSocket.emit('queue-to-grbl', { line: 'G91\nG1 F'+$('#jogSpeed').val()+' X'+$('#jogSize').val()+'\nG90'});
	});

	$('#yP').on('click', function() {
		gSocket.emit('queue-to-grbl', { line: 'G91\nG1 F'+$('#jogSpeed').val()+' Y'+$('#jogSize').val()+'\nG90'});
	});

	$('#yM').on('click', function() {
		gSocket.emit('queue-to-grbl', { line: 'G91\nG1 F'+$('#jogSpeed').val()+' Y-'+$('#jogSize').val()+'\nG90'});
	});

	$('#zP').on('click', function() {
		gSocket.emit('queue-to-grbl', { line: 'G91\nG1 F'+$('#jogSpeed').val()+' Z'+$('#jogSize').val()+'\nG90'});
	});

	$('#zM').on('click', function() {
		gSocket.emit('queue-to-grbl', { line: 'G91\nG1 F'+$('#jogSpeed').val()+' Z-'+$('#jogSize').val()+'\nG90'});
	});

// ----------------------------------------------------------------------------
//  On tab-control click
// ----------------------------------------------------------------------------

$('#tab-control').on( 'click', ( inEvent ) =>
{
  selectTab( 'control' );
} );

// ----------------------------------------------------------------------------
//  On tab-operate click
// ----------------------------------------------------------------------------

$('#tab-operate').on( 'click', ( inEvent ) =>
{
    selectTab( 'operate' );
} );

// ----------------------------------------------------------------------------
//  On tab-gcode-settings click
// ----------------------------------------------------------------------------

$('#tab-gcode-settings').on( 'click', ( inEvent ) =>
{
	// Refresh the gcode parameters and parser state

	gSocket.emit( 'request-gcode-params' );
	gSocket.emit( 'request-parser-state' );

  selectTab( 'gcode-settings' );
} );

// ----------------------------------------------------------------------------
//  On gcode-origin radio button change.
// ----------------------------------------------------------------------------

$('.gcode-origin input').on( 'change', ( inEvent ) =>
{
  let val = inEvent.target.value;

  console.debug( "Detected radio button changed to '" + val + "'" );

  gSocket.emit('queue-to-grbl', { line: val } );

} );

// ----------------------------------------------------------------------------
//  On gcode-setting input change
// ----------------------------------------------------------------------------

$('.gcode-setting').on( 'input', ( inEvent ) =>
{
	checkGCodeSettings();
} );

// ----------------------------------------------------------------------------
//  On set_wco_btn button click.
// ----------------------------------------------------------------------------

$('.go_wco_btn').on( 'click', ( inEvent ) =>
{
	let val = inEvent.target.value;

  console.debug( "Moving to " + val );

	let x = gGCodeSettings[ val + 'x' ];
	let y = gGCodeSettings[ val + 'y' ];
	let z = gGCodeSettings[ val + 'z' ];

	var cmd;

	// We do separate moves of Z and XY.  The order depends
	// on what Z move we need.  If we need to move Z higher
	// we do it first.  If we need to move it lower we do
	// the XY first.  Hopefully, this makes it less likely
	// to run into anything.

	if (z > gCurrentMachineZ)
	{
		cmd  = '$J=F1000G90G53Z' + z;
		cmd += '\n'
		cmd += '$J=F1000G90G53X' + x + 'Y' + y;
	}
	else
	{
		cmd  = '$J=F1000G90G53X' + x + 'Y' + y;
		cmd += '\n'
		cmd += '$J=F1000G90G53Z' + z;
	}

  gSocket.emit('queue-to-grbl', { line: cmd } );
} );

// ----------------------------------------------------------------------------
//  On set_wco_btn button click.
// ----------------------------------------------------------------------------

$('.set_wco_btn').on( 'click', ( inEvent ) =>
{
  let val = inEvent.target.value;

  console.debug( "setting " + val + " coordinates" );

	let currentX = $('#mX').html();
	let currentY = $('#mY').html();
	let currentZ = $('#mZ').html();

	if (gDisplayIsInches)
	{
		currentX = (25.4 * parseFloat( currentX )).toFixed( 3 );
		currentY = (25.4 * parseFloat( currentY )).toFixed( 3 );
		currentZ = (25.4 * parseFloat( currentZ )).toFixed( 3 );
	}

	console.debug( "setting " + val + " coordinates", currentX, currentY, currentZ );

  $('.gcode-setting[name=' + val + 'x]').val( currentX );
  $('.gcode-setting[name=' + val + 'y]').val( currentY );
  $('.gcode-setting[name=' + val + 'z]').val( currentZ );

	checkGCodeSettings();
} );

// ----------------------------------------------------------------------------
//  On btn-commit-gcode-settings click
// ----------------------------------------------------------------------------

$('#btn-commit-gcode-settings').on( 'click', ( inEvent ) =>
{
	console.debug( "commit gcode settings " );

  let theCommand = "";

	for (const [a, b] of  Object.entries( gGCodeSettings ))
  {
    let theInput = $('input[name="' + a + '"]');
    let theValue =  theInput.val();
	
		if (!theValue.match( /^-?[0-9]*\.?[0-9]*$/ ))
		{
			return;
		}

		if (theValue != b)
		{
			var p;
			var coord;

			switch (a)
			{
				case 'g54x': theCommand += 'G10 L2 P1 X' + theValue + '\n'; break;
				case 'g54y': theCommand += 'G10 L2 P1 Y' + theValue + '\n'; break;
				case 'g54z': theCommand += 'G10 L2 P1 Z' + theValue + '\n'; break;
				case 'g55x': theCommand += 'G10 L2 P2 X' + theValue + '\n'; break;
				case 'g55y': theCommand += 'G10 L2 P2 Y' + theValue + '\n'; break;
				case 'g55z': theCommand += 'G10 L2 P2 Z' + theValue + '\n'; break;
				case 'g56x': theCommand += 'G10 L2 P3 X' + theValue + '\n'; break;
				case 'g56y': theCommand += 'G10 L2 P3 Y' + theValue + '\n'; break;
				case 'g56z': theCommand += 'G10 L2 P3 Z' + theValue + '\n'; break;
				case 'g57x': theCommand += 'G10 L2 P4 X' + theValue + '\n'; break;
				case 'g57y': theCommand += 'G10 L2 P4 Y' + theValue + '\n'; break;
				case 'g57z': theCommand += 'G10 L2 P4 Z' + theValue + '\n'; break;
				case 'g58x': theCommand += 'G10 L2 P5 X' + theValue + '\n'; break;
				case 'g58y': theCommand += 'G10 L2 P5 Y' + theValue + '\n'; break;
				case 'g58z': theCommand += 'G10 L2 P5 Z' + theValue + '\n'; break;
				case 'g59x': theCommand += 'G10 L2 P6 X' + theValue + '\n'; break;
				case 'g59y': theCommand += 'G10 L2 P6 Y' + theValue + '\n'; break;
				case 'g59z': theCommand += 'G10 L2 P6 Z' + theValue + '\n'; break;

				case 'g28x': theCommand += 'G28.1 X' + theValue + '\n'; break;
				case 'g28y': theCommand += 'G28.1 Y' + theValue + '\n'; break;
				case 'g28z': theCommand += 'G28.1 Z' + theValue + '\n'; break;

				case 'g30x': theCommand += 'G30.1 X' + theValue + '\n'; break;
				case 'g30y': theCommand += 'G30.1 Y' + theValue + '\n'; break;
				case 'g30z': theCommand += 'G30.1 Z' + theValue + '\n'; break;

				// case 'g92x': theCommand += 'G10 P6 X' + theValue + '\n'; break;
				// case 'g92y': theCommand += 'G10 P6 Y' + theValue + '\n'; break;
				// case 'g92z': theCommand += 'G10 P6 Z' + theValue + '\n'; break;

				case 'tlo-len': theCommand += 'G43.1 Z' + theValue + '\n'; break;

				// case 'prbx': theCommand += 'G10 P6 X' + theValue + '\n'; break;
				// case 'prby': theCommand += 'G10 P6 Y' + theValue + '\n'; break;
				// case 'prbz': theCommand += 'G10 P6 Z' + theValue + '\n'; break;
				// case 'prbo': theCommand += 'G10 P6 Z' + theValue + '\n'; break;
			}
		}
	}

  if (theCommand != '')
  {
    console.debug( "Send Command:", theCommand );

    gSocket.emit( 'queue-to-grbl', { line: theCommand } );
  }
} );

// ----------------------------------------------------------------------------
//  On btn-revert-gcode-settings click
// ----------------------------------------------------------------------------

$('#btn-revert-gcode-settings').on( 'click', ( inEvent ) =>
{
	console.debug( "revert gcode settings " );

  gSocket.emit( 'request-gcode-params', {} );
} );

// ----------------------------------------------------------------------------
//  On tab-grbl-settings click
// ----------------------------------------------------------------------------

$('#tab-grbl-settings').on( 'click', ( inEvent ) =>
{
  gSocket.emit( 'request-grbl-settings', {} );

  selectTab( 'grbl-settings' );
} );

// ----------------------------------------------------------------------------
//  Keyboard Actions
// ----------------------------------------------------------------------------

	// WASD and up/down keys

	$(document).keydown( ( e ) =>
	{
		const keyCode = e.keyCode || e.which;

		if ($('#console-input').is( ':focus' ))
		{
			// don't handle keycodes inside command window
			return;
		}

		switch (keyCode)
    {
		case 65:
			// a key X-
			e.preventDefault();
			$('#xM').click();
			break;
		case 68:
			// d key X+
			e.preventDefault();
			$('#xP').click();
			break;
		case 87:
			// w key Y+
			e.preventDefault();
			$('#yP').click();
			break;
		case 83:
			// s key Y-
			e.preventDefault();
			$('#yM').click();
			break;
		case 38:
			// up arrow Z+
			e.preventDefault();
			$('#zP').click();
			break;
		case 40:
			// down arrow Z-
			e.preventDefault();
			$('#zM').click();
			break;
		}
	} );

  // ----------------------------------------------------------------------------
  //  On console-input keydown
  // ----------------------------------------------------------------------------
  // Send the G-code on a shift-click.

	$('#console-input').keydown( inEvent =>
  {
		if ((clientOS == OS_MAC) ? inEvent.metaKey : inEvent.shiftKey)
    {
			const keyCode = inEvent.keyCode || inEvent.which;

      if (keyCode == 13)
      {
				// we have command/shift + enter -- fake a send-gcode-btn click.
				$('#send-gcode-btn').click();

				// stop enter from creating a new line
				inEvent.preventDefault();
			}
		}
	} );

  // ----------------------------------------------------------------------------
  //  On window click
  // ----------------------------------------------------------------------------
  // Close any dropdown if the user clicks outside of it

  window.onclick = inEvent =>
  {
    if (!inEvent.target.matches( '.btn-dropdown' ))
    {
      $(".dropdown-menu").css( 'display', 'none' );
    }
  }

	// // center the control point

	// $('#betterControlsPoint').css('top', (betterHeight/2)-(bPointHeight/2) + 'px');
	// $('#betterControlsPoint').css('left', (betterWidth/2)-(bPointWidth/2) + 'px');

	// // on mousedown, set isMouseDown to true

  // $('#betterControls').mousedown(function(event) {
	// 	event.preventDefault();
	// 	isMouseDown = true;
  //       });
  //       document.getElementById('betterControls').addEventListener('touchstart', function(event) {
	// 	event.preventDefault();
	// 	isMouseDown = true;
	// }, false);

	// // on mouseup reset center point
  // $('#betterControls').mouseup(function(event) {
	// 	event.preventDefault();
	// 	isMouseDown = false;
	// 	$('#betterControlsPoint').css('top', (betterHeight/2)-(bPointHeight/2) + 'px');
	// 	$('#betterControlsPoint').css('left', (betterWidth/2)-(bPointWidth/2) + 'px');
	// });

	// document.getElementById('betterControls').addEventListener('touchend', function(event) {
	// 	event.preventDefault();
	// 	isMouseDown = false;
	// 	$('#betterControlsPoint').css('top', (betterHeight/2)-(bPointHeight/2) + 'px');
	// 	$('#betterControlsPoint').css('left', (betterWidth/2)-(bPointWidth/2) + 'px');
	// });

	// // loop for bettercontrol

	// setInterval(function() {
	// 	if (isMouseDown) {

	// 		let gcX = betterX-(betterWidth/2);
	// 		let gcY = betterY-(betterHeight/2);

	// 		// add the scale factors
	// 		gcX = xSf*gcX;
	// 		gcY = ySf*gcY;

	// 		// invert y axis because JS and CNC are opposite there
	// 		if (gcY < 0) {
	// 			gcY = Math.abs(gcY);
	// 		} else if (gcY > 0) {
	// 			gcY = -gcY;
	// 		}

	// 		// first get speed, calculated from the mean of abs(x) and abs(y)
	// 		//let fSpeed = (Math.abs(gcX)+Math.abs(gcY))/2;

	// 		// first get speed, calculated from the highest abs of x and y
	// 		if (Math.abs(gcX) > Math.abs(gcY)) {
	// 			let fSpeed = Math.abs(gcX)*$('#jogSpeed').val();
	// 		} else {
	// 			let fSpeed = Math.abs(gcY)*$('#jogSpeed').val();
	// 		}

	// 		fSpeed = Math.round(fSpeed*100)/100;

	// 		// set final position movements based on #jogSize
	// 		gcX = Math.round(gcX*$('#jogSize').val()*1000)/1000;
	// 		gcY = Math.round(gcY*$('#jogSize').val()*1000)/1000;

	// 		// gcode to send
	// 		gSocket.emit('queue-to-grbl', { line: 'G91\nG0 F'+fSpeed+' X'+gcX+' Y'+gcY+'\nG90\n'});
	// 	}
	// }, 200);

	// // on mousemove send gcode
  // $('#betterControls').mousemove(function(event) {
	// 	if (isMouseDown) {
	// 			betterX = event.pageX-this.offsetLeft;
	// 			betterY = event.pageY-this.offsetTop;

	// 			// move point
	// 			$('#betterControlsPoint').css('top',betterY-(bPointHeight/2) + 'px');
	// 			$('#betterControlsPoint').css('left',betterX-(bPointWidth/2) + 'px');

	// 	}
  //       });
  //       document.getElementById('betterControls').addEventListener('touchmove', function(event) {
	// 	event.preventDefault();
	// 	if (isMouseDown) {
	// 			betterX = event.pageX-this.offsetLeft;
	// 			betterY = event.pageY-this.offsetTop;

	// 			// move point
	// 			$('#betterControlsPoint').css('top',betterY-(bPointHeight/2) + 'px');
	// 			$('#betterControlsPoint').css('left',betterX-(bPointWidth/2) + 'px');

	// 	}
  //       });

// 	$(window).resize(() =>
//   {
//     console.debug( "window resize" );

// //    $("body").height( $(document).height() );

// 		// $('.table-layout').css('margin-top',$('.navbar-collapse').height()-34);
// 	} );

	// ==========================================================================
	//  Initialization code run when page loads.
	// ==========================================================================

  const theAppVersion = navigator.appVersion;

  if      (theAppVersion.indexOf( "Mac" )   != -1) clientOS = OS_MAC;
  else if (theAppVersion.indexOf( "Win" )   != -1) clientOS = OS_WINDOWS;
  else if (theAppVersion.indexOf( "Linux" ) != -1) clientOS = OS_LINUX;
  else if (theAppVersion.indexOf( "X11" )   != -1) clientOS = OS_UNIX;

  if (clientOS == OS_MAC)
  {
    $('#send-gcode-btn').html( "Send GCode (⌘⏎)" );
  }

	// --------------------------------------------------------------------------
	//  G-Code Upload Actions
	// --------------------------------------------------------------------------

	if (window.FileReader)
	{
		const reader = new FileReader ();

		function openGCode( inEvent )
		{
      const gcode = this.result;
			document.getElementById('console-input').value = gcode;
			openGCodeFromText( gcode );
    }

		function dragEvent( inEvent )
		{
			inEvent.stopPropagation ();
			inEvent.preventDefault ();

			if (typeof inEvent == 'drop')
			{
				reader.onloadend = openGCode;

				reader.readAsText( inEvent.dataTransfer.files[0] );
			}
		}

		// -- Command drag and drop support --

		const commandInput = document.getElementById( 'console-input' );

		commandInput.addEventListener( 'dragenter', dragEvent, false );
		commandInput.addEventListener( 'dragover',  dragEvent, false );
		commandInput.addEventListener( 'drop',      dragEvent, false );
	}
	else
	{
		alert( 'Your browser is too old to upload files, get a newer version.' );
	}
} );
