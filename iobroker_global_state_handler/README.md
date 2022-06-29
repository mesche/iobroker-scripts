# IOBROKER - GLOBAL STATE HANDLER

This script is a workaround to avoid some communication problems with the ioBroker HomeMatic RPC Adapters (ioBroker.hm-rpc).
It is useful if multiple setState commands are triggered in a short time.
A global queue is used to execute multiple setState commands synchronously.


## Script
* [iobroker_global_state_handler.js](iobroker_global_state_handler.js) - The global state handler script


## Prerequisites
 * Javascript Script Engine - https://github.com/ioBroker/ioBroker.javascript
 * HomeMatic RPC Adapter - https://github.com/ioBroker/ioBroker.hm-rpc


## Installation

Save the code as global script in ioBroker.

## Usage
```
(async () => {
   GSH.setState('javascript.0.variables.test', '1'); // do not wait until action have been processed
   await GSH.setState('javascript.0.variables.test', '2'); // wait until action have been processed
   await GSH.waitWhileProcessing(); // wait until all actions in queue have been processed
})();
```

## Links
 * [setState: Synchrone Verarbeitung der ioBroker Homematic RPC Adapter Befehle via BIN-RPC/XML-RPC um Probleme bei der Kommunikation zu vermeiden](https://www.blogging-it.com/setstate-synchrone-verarbeitung-der-iobroker-homematic-rpc-adapter-befehle-via-bin-rpc-xml-rpc-um-probleme-bei-der-kommunikation-zu-vermeiden/hausautomatisierung-smart-home/iobroker/skripte-und-logiken.html)


## Contributing

Please submit all pull requests against the master branch. If your code contains new code, patches or features, you should include relevant unit tests.


## Authors

Markus Eschenbach

* [Blog](http://www.blogging-it.com)


----------------------------------

Markus Eschenbach  
http://www.blogging-it.com
