import { multiply } from "./math.js";

export function double(x) {
  return multiply(x, 2);
}

export function triple(x) {
  return multiply(x, 3);
}

function deepNest(x) {
  if(x > 0) {
    if(x % 2 === 0) {
      if(x % 4 === 0) {
        console.log("Deep Nest!");
      }
    }
  }
}
