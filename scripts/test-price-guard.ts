/**
 * The sender now re-asserts the pricing check before SMTP. This proves the guard
 * blocks a wrong yearly price and does NOT block a body that quotes the offer
 * correctly — including every format the message agent might emit.
 */
import { checkPrice } from "@/agents/verifier";
import { PRICING, OFFER_SUMMARY } from "@/agents/types";

console.log(`offer: ${OFFER_SUMMARY}\n`);

const cases: { name: string; body: string; expectPass: boolean }[] = [
  {
    name: "correct: Rs 50,000 one-time + Rs 2,000/year",
    body: `We build complete school systems. Rs 50,000 is a one-time setup fee. The only recurring amount is Rs 2,000 per year for maintenance.`,
    expectPass: true,
  },
  {
    name: "correct: rupee symbol form",
    body: `Price is \u20b950,000 one time, plus \u20b92,000 per year for maintenance.`,
    expectPass: true,
  },
  {
    name: "correct: no digits separators",
    body: `Setup is 50000 (one-time). Maintenance 2000 per year.`,
    expectPass: true,
  },
  {
    name: "no price mentioned at all",
    body: `Hello, we build school admission systems. Would you like a demo?`,
    expectPass: true,
  },
  {
    name: "WRONG: 50,000 per year",
    body: `Our system costs Rs 50,000 per year including everything.`,
    expectPass: false,
  },
  {
    name: "WRONG: 150,000 one-time",
    body: `Rs 150,000 one-time setup, then Rs 12,000 per year for maintenance.`,
    expectPass: false,
  },
  {
    name: "WRONG: setup fee framed as yearly",
    body: `Rs 50,000 is our yearly subscription price.`,
    expectPass: false,
  },
];

let failures = 0;
for (const c of cases) {
  const r = checkPrice(c.body);
  const pass = r.passed;
  const verdict = pass === c.expectPass ? "OK " : "BAD";
  if (pass !== c.expectPass) failures++;
  console.log(`${verdict} expected=${c.expectPass ? "pass" : "block"} got=${pass ? "pass" : "block"}  ${c.name}`);
  if (!pass) console.log(`       detail: ${r.detail}`);
}

console.log(`\nsetupFee=${PRICING.setupFee} annual=${PRICING.annualMaintenance}`);
console.log(failures === 0 ? "PASS: pricing guard behaves correctly" : `FAIL: ${failures} case(s) wrong`);
