import { add, multiply } from "./math.js";
import { greetUser, farewellUser } from "./utils.js";

function startApp() {
  greetUser("Lakshmanan");
  const x = add(5, 10);
  const y = multiply(x, 3);
  console.log("Result:", y);
  farewellUser("Lakshmanan");
}

startApp();
