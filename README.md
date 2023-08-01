## About

Grbler is a Node.js based GCODE sender and controller for GRBL.  Multiple serial devices can be connected to control multiple machines.

Copyright 2022 Craig Altenburg  craig@curuvar.com   under the GNU AFFERO GENERAL PUBLIC LICENSE Version 3

Based on GRBLWeb by Andrew Hodel   andrewhodel@gmail.com   (Copyright 2021 and released under Gnu AGPL V3)

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

If you would like to include this code in a project which is not licensed under the AGPL V3, please contact the author at andrewhodel@gmail.com

## GRBL v.8 vs v.9 and baud rate

GRBL .9 uses 115200 baud rate while previous versions use 9600, if you are using GRBL .8 change config.serialBaudRate to 9600 in config.js.

## GRBL Reading

https://github.com/grbl/grbl

https://github.com/grbl/grbl/wiki/Configuring-Grbl-v0.8

http://onehossshay.wordpress.com/2011/08/21/grbl-how-it-works-and-other-thoughts/

## Installation

```
git clone https://github.com/curuvar/grbler.git
cd grbler
npm install
```

## Config

edit config.js to change serial port, baud rate, web port, and other options.

## Running

// standalone
```
node server.js
```

// with forever
```
npm install -g forever
forever start server.js
```

## Access

The default port in config.js is 8000, you can change it by editing the file.

http://<hostaddress>:8000/

