// node tests/gAST/gaststuff.js


// INCLUDE
// file write/read
var fs = require('fs');
var url = require('url');
// MongoDB
var Db = require('mongodb').Db,
    MongoClient = require('mongodb').MongoClient,
    Server = require('mongodb').Server,
    ReplSetServers = require('mongodb').ReplSetServers,
    ObjectID = require('mongodb').ObjectID,
    Binary = require('mongodb').Binary,
    GridStore = require('mongodb').GridStore,
    Grid = require('mongodb').Grid,
    Code = require('mongodb').Code,
    // BSON = require('mongodb').pure().BSON,
    assert = require('assert');
// Esprima
var esprima = require('esprima');
// escodegen
var escodegen = require('escodegen')
// library
var tools = require('./testTemplateTools.js');

// global stuff in here
dat = {
	scripts: [],		// array of scripts read in
	ASTs: [],			// array of ASTs
	gASTs: [],			// array of gASTs
	ASTGhosts: [],		// array of gAST ghosts
	ASTAgain: [],		// make AST from gASTs
	scriptsAgain: [],
}

hardCodeScripts();
function hardCodeScripts(){
	// dat.scripts.push({script: "myArray = [1, 2, 3, 4];"});
	// dat.scripts.push({script: "myObject = {first: 1, second: 2, third: 3};"});
	// dat.scripts.push({script: "[1, 2, 3, 4, \"myString\", true, false, null, undefined, \"undefined\", 3.20];"});
	// dat.scripts.push({script: "myObject = {first: 1, second: 2, third: 3, myString: \"this string\", myBool: true, null: null, undefined: undefined};"});
	dat.scripts.push({script: "  google.load(\'visualization\', \'1\', {packages: [\'gauge\']});\r\n  google.setOnLoadCallback(drawGauge);\r\n\r\n  var gaugeOptions = {min: 0, max: 280, yellowFrom: 200, yellowTo: 250,\r\n    redFrom: 250, redTo: 280, minorTicks: 5};\r\n  var gauge;\r\n\r\n  function drawGauge() {\r\n    gaugeData = new google.visualization.DataTable();\r\n    gaugeData.addColumn(\'number\', \'Engine\');\r\n    gaugeData.addColumn(\'number\', \'Torpedo\');\r\n    gaugeData.addRows(2);\r\n    gaugeData.setCell(0, 0, 120);\r\n    gaugeData.setCell(0, 1, 80);\r\n\r\n    gauge = new google.visualization.Gauge(document.getElementById(\'gauge_div\'));\r\n    gauge.draw(gaugeData, gaugeOptions);\r\n  }\r\n\r\n  function changeTemp(dir) {\r\n    gaugeData.setValue(0, 0, gaugeData.getValue(0, 0) + dir * 25);\r\n    gaugeData.setValue(0, 1, gaugeData.getValue(0, 1) + dir * 20);\r\n    gauge.draw(gaugeData, gaugeOptions);\r\n  }"});
}



main();

// main()
	// scripts in array dat.scripts
	// each element is object with fields
	// hostname, script, url
	// these fields contain strings
	// for each script, make AST, gAST, hash
	// flow continues at makeTemplate
function main(){
	// make ASTs
	dat.ASTs = tools.makeASTs(dat.scripts);
	dat.gASTs = tools.modit(dat.ASTs);
	dat.ASTAgain = tools.putitback(dat.gASTs);
	dat.scriptsAgain = tools.makeScriptAgainFake(dat.ASTAgain);
	// make gAST Objects
	// dat.gASTs = tools.makegASTObjects(dat.ASTs).gASTs;
	// dat.ASTGhosts = tools.makegASTObjects(dat.ASTs).ASTGhosts;
	// reconstruct AST
	//dat.ASTAgain = tools.makeASTAgain(dat.gASTs, dat.ASTGhosts);
	compare(dat.ASTs, dat.ASTAgain, "");
	// dat.scriptsAgain = tools.makeScriptAgain(dat.ASTagain);
	// compareScripts(dat.scripts, dat.scriptsAgain);


	return;
}

function compare(ast, asta, path){
	// for(var key in ast) {
	// 	if((ast.hasOwnProperty(key)) && (ast[key] != null) && (typeof ast[key] == "object")) {
	// 		if (!asta[key]){
	// 			console.log("not exist: " + key + " at: " + path);
	// 			return;
	// 		}
	// 		compare(ast[key], asta[key], path+"\[\"" + key + "\"\]");
	// 	}

	// 	if (asta[key] != ast[key]){
	// 		console.log("not same at: " + path + "\nast.key: " + ast.key + "\nasta.key: " + asta.key);
	// 		console.log("key: " + key + "\n");
	// 		return
	// 	}
	// }

	// console.log("conclude sadness");

	// console.log("done, comparing results: " + String(JSON.stringify(ast) == JSON.stringify(asta)));

	// return;
	console.log("ast length: " + JSON.stringify(ast).length);
	console.log("asta length: " + JSON.stringify(asta).length);
	// console.log("ast if exist \"ASTNodeID\": " + JSON.stringify(ast).search("ASTNodeID"));
	// console.log("ast if exist \"tag\": " + JSON.stringify(ast).search("tag"));
	// console.log("ast if exist \"value\": " + JSON.stringify(ast).search("value"));
	// console.log("asta if exist \"ASTNodeID\": " + JSON.stringify(asta).search("ASTNodeID"));
	// console.log("asta if exist \"tag\": " + JSON.stringify(asta).search("tag"));
	// console.log("asta if exist \"value\": " + JSON.stringify(asta).search("value"));
}

function compareScripts(s, sa){
	s = s[0]; sa = sa[0];
	
	console.log("s length: " + s.length);
	console.log("sa length: " + sa.length);
}



