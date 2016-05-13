var fs = require('fs');

getRand = {
	num: function(){return String(Math.random() * 100)},
	string: function(){
	    var text = "";
	    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

	    for( var i=0; i < 10; i++ ){
	        text += possible.charAt(Math.floor(Math.random() * possible.length));
	    }

	    return text;
	},
	varName: function(){
	    var text = "";
	    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

	    for( var i=0; i < 10; i++ ){
	        text += possible.charAt(Math.floor(Math.random() * possible.length));
	    }

	    return text;
	}
};

// Check call, get source and destination addresses
numOfArgs = process.argv.length;
if (numOfArgs > 5){
	console.log("improper call");
	return;
}

num_train = 100;
num_test_pass = 30;
num_test_fail = 30;

if (numOfArgs > 3){num_train = process.argv[2];};
if (numOfArgs > 4){num_test_pass = process.argv[3];};
if (numOfArgs > 5){num_test_fail = process.argv[4];};



main()
function main(){
	train_string = "";
	test_string = "";

	for (i=0; i<num_train; i++){
		train_string += makeScript(true) + "\n";
	}
	for (i=0; i<num_test_pass; i++){
		test_string += makeScript(true) + "\n";
	}
	for (i=0; i<num_test_fail; i++){
		test_string += makeScript(false) + "\n";
	}

	//save to destination
	fs.writeFile("train.txt", train_string, function (err) {
	  if (err){return console.log("Could not write to destination path")}
	});
	fs.writeFile("test.txt", test_string, function (err) {
	  if (err){return console.log("Could not write to destination path")}
	});
}

function makeScript(expected){
	if (expected){
		s = "";
		s += "var a = "+getRand.num()+" + "+getRand.num()+";";
		s += "var b = \""+getRand.string()+"\";";
		s += "var c = true;";
		s += "var d = ["+getRand.num()+", "+getRand.num()+", \""+getRand.string()+"\", ["+getRand.num()+", "+getRand.num()+", \""+getRand.string()+"\"]];";
		s += "var e = {a: "+getRand.num()+", b:\""+getRand.string()+"\"};";
		return s;
	}
	else {
		s = "";
		s += "var "+getRand.varName()+" = "+getRand.num()+" + "+getRand.num()+";";
		s += "var b = \""+getRand.string()+"\";";
		s += "var "+getRand.varName()+" = true;";
		s += "var d = ["+getRand.num()+", "+getRand.num()+", \""+getRand.string()+"\", ["+getRand.num()+", "+getRand.num()+", \""+getRand.string()+"\"]];";
		s += "var "+getRand.varName()+" = {a: "+getRand.num()+", b:\""+getRand.string()+"\"};";
		return s;
	}
}

// template
// s = "";
// s += "var a = 1 + 5;";
// s += "var b = \"string\";";
// s += "var c = true;var";
// s += "d = [1, 2, \"string\", [1, 2, \"string\"]];";
// s += "var e = {a: 1, b:\"string\"};";