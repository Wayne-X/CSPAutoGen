// Creates AST given a script
// call with "js makeAST.js scriptAddress ASTAddress"
// example: "js makeAST.js scripts/test1.js AST"
//
// depends on esprima. See esprima.org
// install esprima with "sudo npm install esprima"

// load esprima
var esprima = require('esprima');
var fs = require('fs');

// Check call, get source and destination addresses
numOfArgs = process.argv.length;
// if (numOfArgs != 4){
// 	console.log("improper call. Call with:\njs makeAST.js scriptSrcAddr ASTDestAddr");
// 	return;
// }

srcAddr = process.argv[2];
destAddr = process.argv[3];

// get script
fs.readFile("scripts/" + srcAddr, 'utf8', function (err,data) {
	if (err) {
		console.log("Bad script source address: " + srcAddr);
		return;
	}
	makeAST(data);
});

// make AST
function makeAST(script){
//	console.log("Script begins with: " + script.slice(0, 0+20));
	AST = esprima.parse(script);
//	console.log("syntax is: " + AST);
	var ASTString = JSON.stringify(AST)
//	console.log("Script begins with: " + ASTString.slice(0, 0+20));

//save to destination
console.log("Writing AST to \"" + destAddr + "\"");
fs.writeFile("AST/" + srcAddr, ASTString, function (err) {
  if (err){return console.log("Could not write to destination path")}
	//else {console.log("Success");};
});
}
