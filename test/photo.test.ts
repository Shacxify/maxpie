import assert from "node:assert/strict";
import { test } from "node:test";
import { resizedUrl, supportedMediaType, type PhotoSource } from "../src/photo.js";

const photo = (width: number, height: number): PhotoSource => ({
  url: "https://cdn.discordapp.com/attachments/1/2/bird.jpg?ex=abc",
  proxyUrl: "https://media.discordapp.net/attachments/1/2/bird.jpg?ex=abc",
  contentType: "image/jpeg",
  width,
  height,
});

test("small photos are fetched as-is", () => {
  assert.equal(resizedUrl(photo(1200, 800)), photo(1200, 800).url);
});

test("big photos are resized through the media proxy, keeping the aspect ratio", () => {
  const url = new URL(resizedUrl(photo(4032, 3024)));
  assert.equal(url.host, "media.discordapp.net");
  assert.equal(url.searchParams.get("width"), "1568");
  assert.equal(url.searchParams.get("height"), "1176");
  assert.equal(url.searchParams.get("ex"), "abc");
});

test("only image types the model can read are accepted", () => {
  assert.equal(supportedMediaType("image/jpeg"), "image/jpeg");
  assert.equal(supportedMediaType("image/PNG; charset=binary"), "image/png");
  assert.equal(supportedMediaType("image/heic"), undefined);
  assert.equal(supportedMediaType(null), undefined);
});
