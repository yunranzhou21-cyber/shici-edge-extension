import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PREFERENCES,preferences,preferencePatch} from '../extension/lib/preferences.js';
test('floating preferences preserve safe defaults for old installations',()=>{assert.deepEqual(preferences(),DEFAULT_PREFERENCES);assert.deepEqual(preferences(null),DEFAULT_PREFERENCES);});
test('position, opacity and size stay within bounds',()=>{const p=preferences({x:50,y:-5,opacity:0.1,size:999});assert.equal(p.x,1);assert.equal(p.y,0);assert.equal(p.opacity,0.4);assert.equal(p.size,48);assert.equal(preferences({size:56,visible:false}).visible,false);});
test('floating settings reject secret fields and invalid types',()=>{for(const patch of [{apiKey:'x'},{size:'48'},{visible:1},{x:NaN},null,[]])assert.throws(()=>preferencePatch(patch));assert.deepEqual(preferencePatch({size:40,opacity:0.8}),{size:40,opacity:0.8});});
