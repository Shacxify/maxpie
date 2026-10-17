import assert from "node:assert/strict";
import { test } from "node:test";
import type { Identification } from "../src/model.js";
import { buildEmbed, truncate } from "../src/embed.js";

const finch: Identification = {
  photo_usable: true,
  is_animal: true,
  common_name: "House Finch",
  scientific_name: "Haemorhous mexicanus",
  is_bird: true,
  ebird_species_code: "houfin",
  confidence: "high",
  confidence_line: "i'd bet my binoculars on it",
  likely_region: "west coast-ish",
  region_reasoning: "backyard feeder, bright red male.",
  field_notes: "the red's from what he eats.",
  conservation_status: "least concern, doing great",
  fun_fact: "they used to be sold as 'hollywood finches'.",
  id_tip: "purple finch is more raspberry, no streaky flanks.",
  migration_notes: "mostly resident.",
  excitement: "common",
  max_take: "mm. house finch. total trash bird, love him.",
};

const never = () => 0.99;
const always = () => 0;

test("common bird keeps its normal title and lists the data credits", () => {
  const embed = buildEmbed(finch, {}, "https://cdn.example/photo.jpg", never);
  assert.equal(embed.title, "House Finch");
  assert.equal(embed.description, finch.max_take);
  assert.equal(embed.image?.url, "https://cdn.example/photo.jpg");
  assert.equal(embed.footer?.text, "data: GBIF · Wikipedia");
});

test("rare bird gets the all caps treatment", () => {
  const embed = buildEmbed({ ...finch, common_name: "Burrowing Owl", excitement: "rare" }, {}, undefined, never);
  assert.equal(embed.title, "BURROWING OWL!!");
  assert.equal(embed.color, 0xe0a100);
});

test("sometimes max just leaves", () => {
  assert.equal(buildEmbed(finch, {}, undefined, always).footer?.text, "max left.");
});

test("empty fields are left out instead of rendered blank", () => {
  const embed = buildEmbed({ ...finch, id_tip: "", migration_notes: "  " }, {}, undefined, never);
  const names = embed.fields?.map((f) => f.name) ?? [];
  assert.ok(!names.includes("ID tip"));
  assert.ok(!names.includes("Range & migration"));
  assert.ok(!names.includes("Song / call"));
  assert.ok(!names.includes("Nearby sightings"));
});

test("GBIF's IUCN category leads the conservation field", () => {
  const embed = buildEmbed(
    { ...finch, conservation_status: "doing great, everywhere" },
    { gbif: { scientificName: "Haemorhous mexicanus", isBird: true, iucnCategory: "least concern", url: "https://www.gbif.org/species/1" } },
    undefined,
    never,
  );
  const field = embed.fields?.find((f) => f.name === "Conservation status");
  assert.equal(field?.value, "IUCN: least concern. doing great, everywhere");
});

test("GBIF's category isn't repeated when Max already said it", () => {
  const embed = buildEmbed(
    { ...finch, conservation_status: "Least Concern (IUCN), widespread." },
    { gbif: { scientificName: "Haemorhous mexicanus", isBird: true, iucnCategory: "least concern", url: "https://www.gbif.org/species/1" } },
    undefined,
    never,
  );
  const field = embed.fields?.find((f) => f.name === "Conservation status");
  assert.equal(field?.value, "Least Concern (IUCN), widespread.");
});

test("eBird sightings and xeno-canto recordings show up when found", () => {
  const embed = buildEmbed(
    finch,
    {
      sightings: { count: 1, latestDate: "2026-10-01", radiusKm: 50, place: "Alviso Marsh" },
      recording: { url: "https://xeno-canto.org/123", description: "song, United States" },
    },
    undefined,
    never,
  );
  const value = (name: string) => embed.fields?.find((f) => f.name === name)?.value;
  assert.equal(value("Nearby sightings"), "1 eBird report within 50 km of Alviso Marsh in the last 30 days, latest 2026-10-01");
  assert.equal(value("Song / call"), "[song, United States](https://xeno-canto.org/123)");
  assert.equal(embed.footer?.text, "data: GBIF · Wikipedia · eBird · xeno-canto");
});

test("long fields are cut to Discord's 1024 character limit", () => {
  const embed = buildEmbed({ ...finch, field_notes: "a".repeat(5000) }, {}, undefined, never);
  const notes = embed.fields?.find((f) => f.name === "Field notes");
  assert.equal(notes?.value.length, 1024);
  assert.ok(notes?.value.endsWith("..."));
});

test("truncate leaves short text alone", () => {
  assert.equal(truncate("short", 10), "short");
});
