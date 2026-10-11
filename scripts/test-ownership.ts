/**
 * Regression tests for the website-ownership gate. Every "reject" case here is a
 * real mistake the pipeline actually made before the gate was tightened.
 */
import { siteBelongsToSchool, isSendableEmail, registrableDomain, isIndianState, isForeignLead } from "@/lib/validation";

let pass = 0;
let fail = 0;

function check(label: string, actual: boolean, expected: boolean, detail = "") {
  if (actual === expected) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label} — expected ${expected ? "accept" : "reject"}, got ${actual ? "accept" : "reject"}${detail ? ` (${detail})` : ""}`);
  }
}

console.log("\n== real mistakes that must now be rejected ==");
check(
  "angel.com is not Angel Heart Montessori Play School",
  siteBelongsToSchool("https://www.angel.com/", "Angel Heart Montessori Play School", { pageTitle: "Angel Cruises | Cruise Lines" }).owned,
  false,
  siteBelongsToSchool("https://www.angel.com/", "Angel Heart Montessori Play School", { pageTitle: "Angel Cruises" }).reason
);
check(
  "hoodi.dev is not Hoodi High School",
  siteBelongsToSchool("https://hoodi.dev/", "Hoodi High School", { pageTitle: "Hoodi — developer tooling" }).owned,
  false
);
check(
  "a Rajasthan gov site is not an Andhra Pradesh school",
  siteBelongsToSchool("https://gopalan.rajasthan.gov.in/", "Gopalan International Schoool", {
    pageTitle: "Gopalan International School",
    state: "Andhra Pradesh",
  }).owned,
  false
);

console.log("\n== the original junk domains ==");
for (const [site, name] of [
  ["https://www.poki.com/", "Some Primary School"],
  ["https://www.vedantu.com/", "Some High School"],
  ["https://www.reddit.com/r/schools", "Delhi Public School"],
  ["https://www.quora.com/", "Modern Academy"],
  ["https://www.justdial.com/", "Sunrise Academy"],
]) {
  check(`${site} is not ${name}`, siteBelongsToSchool(site, name, { pageTitle: name }).owned, false);
}

const SCHOOL_PAGE =
  "Admissions are open for the academic year. Our students study a CBSE syllabus and our faculty " +
  "teach English, Mathematics and Science. The campus has a library, laboratory and playground. " +
  "Parents may pay fees online and view the syllabus for each class. The principal welcomes enquiries.";

const COMPANY_PAGE =
  "Radiant.in: IT Networking Solutions | Distributor, Partner, Delhi, India. We supply enterprise " +
  "networking hardware and offer consulting services, support contracts and wholesale deals.";

console.log("\n== a company that shares a school's name must be rejected ==");
check(
  "radiant.in (IT distributor) is not Radiant School",
  siteBelongsToSchool("https://radiant.in/", "Radiant School", {
    pageTitle: "Radiant.in: IT Networking Solutions | Distributor, Partner, Delhi, India",
    pageText: COMPANY_PAGE,
  }).owned,
  false,
  siteBelongsToSchool("https://radiant.in/", "Radiant School", {
    pageTitle: "Radiant.in: IT Networking Solutions | Distributor, Partner, Delhi, India",
    pageText: COMPANY_PAGE,
  }).reason
);
check(
  "a cruise line is not a school",
  siteBelongsToSchool("https://www.royalcaribbean.com/", "Royal High School", {
    pageTitle: "Royal Caribbean | Cruise Bookings and Reservations",
    pageText: "Book cruise bookings, reservations and deals. Cruise lines, cruise ships and travel insurance.",
  }).owned,
  false
);

console.log("\n== genuine school sites that must be accepted ==");
for (const [site, name, title] of [
  ["https://www.radiant.edu.in/", "Radiant School", "Radiant School | Radiant Educational Institutions"],
  ["https://carmelcollegemala.ac.in/", "Carmel College Malapuram", "Carmel College Malapuram"],
  ["https://stpeters.edu.in/", "St Peters College", "St Peters College, Bengaluru"],
  ["https://www.dpsdurgapur.com/", "Delhi Public School Durgapur", "Delhi Public School Durgapur"],
  ["https://kpsghyderabad.ac.in/", "K P S School Hyderabad", "K P S International School Hyderabad"],
]) {
  check(`${name} -> ${site}`, siteBelongsToSchool(site, name, { pageTitle: title, pageText: SCHOOL_PAGE }).owned, true,
    siteBelongsToSchool(site, name, { pageTitle: title, pageText: SCHOOL_PAGE }).reason);
}

console.log("\n== right name, wrong school in another state ==");
check(
  "Stella Maris School (Karnataka) != Stella Maris College (Chennai)",
  siteBelongsToSchool("https://stellamariscollege.edu.in/", "Stella Maris School", {
    pageTitle: "Arts & Science College for Women | Stella Maris College | Womens college in chennai",
    pageText:
      "Stella Maris College, Chennai. Students are admitted to the arts and science departments. " +
      "The principal and faculty welcome enquiries about admissions, fees and the curriculum.",
    state: "Karnataka",
  }).owned,
  false
);
check(
  "Radiant School (Assam) != Radiant English Academy (Surat)",
  siteBelongsToSchool("https://www.radiant.edu.in/", "Radiant School", {
    pageTitle: "Radiant English Academy Surat",
    pageText:
      "Radiant English Academy, Surat, Gujarat. Students join our English classes. " +
      "Admissions are open and the principal will guide you on fees and the syllabus.",
    state: "Assam",
  }).owned,
  false
);
check(
  "the same Radiant site IS accepted for a school actually in Gujarat",
  siteBelongsToSchool("https://www.radiant.edu.in/", "Radiant English Academy", {
    pageTitle: "Radiant English Academy Surat",
    pageText:
      "Radiant English Academy, Surat, Gujarat. Students join our English classes. " +
      "Admissions are open and the principal will guide you on fees and the syllabus.",
    state: "Gujarat",
  }).owned,
  true
);

console.log("\n== a long school name is proven by its domain alone ==");
check(
  "Mother Teresa Memorial School -> motherteresamemorial.edu.in",
  siteBelongsToSchool("https://motherteresamemorial.edu.in/", "Mother Teresa Memorial School", {
    pageTitle: "Home",
    pageText: "",
  }).owned,
  true
);
check(
  "but a two-word name still needs the page to back it up",
  siteBelongsToSchool("https://carmelconvent.ac.in/", "Carmel Convent Senior Secondary School", {
    pageTitle: "Home",
    pageText: "",
  }).owned,
  false
);

console.log("\n== the sendability gate ==");
const provSite = { siteDomain: "radiant.edu.in", schoolName: "Radiant School", siteVerified: true };
check("address on the proven school domain passes", isSendableEmail("admissions@radiant.edu.in", provSite).ok, true);
check("address on an unrelated platform is blocked", isSendableEmail("hello@poki.com", provSite).ok, false);
check("gmail is blocked without a published mailto", isSendableEmail("info@gmail.com", provSite).ok, false);
check("gmail is allowed when the site published it", isSendableEmail("info@gmail.com", { ...provSite, fromMailto: true }).ok, true);
check("an unverified site cannot authorise any address", isSendableEmail("admissions@radiant.edu.in", { ...provSite, siteVerified: false }).ok, false);
check("registrableDomain folds www and subdomains", registrableDomain("www.mail.admissions.school.ac.in") === "school.ac.in", true);
check("registrableDomain leaves public suffixes alone", registrableDomain("angelfire.com") === "angelfire.com", true);

console.log("\n== real false positives found in the live database ==");
// Each of these was actually written to the database before the gate was
// tightened, so they are pinned here to stop the rule being loosened again.
check(
  "a lead literally called 'School' cannot claim a government portal",
  siteBelongsToSchool("https://pmshri.education.gov.in/", "School", {
    pageTitle: "PM SHRI Schools | Government of India",
    pageText: "admission notification school education admission teacher recruitment",
  }).owned,
  false
);
check(
  "a generic lead cannot claim a state education department",
  siteBelongsToSchool("https://highereducation.jk.gov.in/", "Higher Primary School", {
    pageTitle: "Higher Education Jammu and Kashmir",
    pageText: "school college admission affiliated universities students",
  }).owned,
  false
);
check(
  "a textbook publisher is not the school",
  siteBelongsToSchool("https://books.ebalbharati.in/", "Bal Bharati School", {
    pageTitle: "eBalBharati | Books",
    pageText: "buy textbooks school books stationery",
  }).owned,
  false
);
check(
  "an exam board portal is not an individual Sainik School",
  siteBelongsToSchool("https://aissee.org/", "Sainik School", {
    pageTitle: "AISSEE Sainik School Entrance Examination",
    pageText: "entrance exam admission test centres school",
  }).owned,
  false
);
// ...while the genuine matches from the same batch must still be accepted.
check(
  "a school whose domain carries its own name is still accepted",
  siteBelongsToSchool("http://halwasiyavidyavihar.in/", "Halwasiya Vidya Vihar Sr. Sec. School", {
    pageTitle: "Halwasiya Vidya Vihar Sr. Sec. School",
    pageText: "school admission fees contact academics students",
  }).owned,
  true
);
check(
  "a college initials + place-name match is still accepted",
  siteBelongsToSchool("https://gcmdy.org/", "Govt College Mananthavady", {
    pageTitle: "Govt College Mananthavady",
    pageText: "college admission students courses",
  }).owned,
  true
);

console.log("\n== the India-only geography guard ==");
check("an Indian state is accepted", isIndianState("Karnataka"), true);
check("a union territory is accepted", isIndianState("Chandigarh"), true);
check("Delhi as an NCT is accepted", isIndianState("NCT of Delhi"), true);
check("a trailing 'State' suffix is tolerated", isIndianState("Telangana State"), true);
check("Myanmar's Chin State is rejected", isIndianState("Chin"), false);
check("Myanmar's Magway Region is rejected", isIndianState("Magway"), false);
check("Bangladesh's Dhaka Division is rejected", isIndianState("Dhaka"), false);
check("Nepal's Bagmati is rejected", isIndianState("Bagmati"), false);
check("Bhutan's Paro is rejected", isIndianState("Paro"), false);
check("a blank state is not treated as Indian", isIndianState(""), false);

// A lead in the north-east that geocoded across the border.
check(
  "a Chin State lead is flagged foreign even inside the lat/lon box",
  isForeignLead(22.0, 93.5, "Basic Education High School", "Chin"),
  true
);
check(
  "the same coordinates in Arunachal Pradesh are Indian",
  isForeignLead(27.1, 93.6, "Dewangshi Public School", "Arunachal Pradesh"),
  false
);
// The lat/lon box alone is too loose — it contains Yangon, which is how 410
// foreign leads survived the original guard. These two cases document that.
check(
  "the lat/lon box on its own wrongly admits a Yangon coordinate",
  isForeignLead(16.8, 96.2, "Basic Education High School", null),
  false
);
check(
  "the resolved state is what actually catches it",
  isForeignLead(16.8, 96.2, "Basic Education High School", "Yangon"),
  true
);
check(
  "coordinates beyond the box are foreign even with no state",
  isForeignLead(4.5, 96.8, "Some School", null),
  true
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
