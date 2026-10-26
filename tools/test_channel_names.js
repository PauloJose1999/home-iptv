/* Regression test: TV channel IDs must still match when the two LG APIs format names differently. */
var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var source = fs.readFileSync('web/home.js', 'utf8');
var display = source.match(/  function channelName\(name\) \{[\s\S]*?\n  \}/);
var key = source.match(/  function plainName\(name\) \{[\s\S]*?\n  \}/);
if (!display || !key) throw new Error('Channel name helpers were not found in web/home.js');
var context = {};
vm.runInNewContext(display[0] + '\n' + key[0] + '\nthis.channelKey = plainName;', context);

assert.strictEqual(context.channelKey('TV Acrítica'), context.channelKey('TV ACRITICA HD'));
assert.strictEqual(context.channelKey('Globo'), context.channelKey('Globo HD'));
assert.strictEqual(context.channelKey('TV Cultura'), context.channelKey(' tv-cultura '));
console.log('OK: antenna channel matching ignores HD suffixes, punctuation, case and Portuguese accents.');
