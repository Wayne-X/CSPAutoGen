a = eval("var a = eval(\"x * y\") + \"<br>\";
var b = eval(\"2 + 2\") + \"<br>\";
var c = eval(\"x + 17\") + \"<br>\";
var d = eval({test: \"some string\", another_test: \"woot\", a: [1, 3, 4, "test"]});
var res = a + b + c;");