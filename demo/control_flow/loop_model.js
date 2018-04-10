/**
 * @license
 * Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import * as tfc from '@tensorflow/tfjs-core';
import {NamedTensorMap, loadFrozenModel} from '@tensorflow/tfjs-converter';
const GOOGLE_CLOUD_STORAGE_DIR =
    'https://storage.googleapis.com/tfjs-models/savedmodel/';
const MODEL_FILE_URL = 'control_flow/tensorflowjs_model.pb';
const WEIGHT_MANIFEST_FILE_URL = 'control_flow/weights_manifest.json';
const OUTPUT_NODE_NAME = 'while/Exit_3';

export class LoopModel {
  constructor() {}

  async load() {
    this.model = await loadFrozenModel(
      GOOGLE_CLOUD_STORAGE_DIR + MODEL_FILE_URL,
      GOOGLE_CLOUD_STORAGE_DIR + WEIGHT_MANIFEST_FILE_URL);
  }

  dispose() {
    if (this.model) {
      this.model.dispose();
    }
  }

  async predict(init, loops, inc) {
    const dict = {
      'init': tfc.scalar(init, 'int32'),
      'times': tfc.scalar(loops, 'int32'),
      'inc': tfc.scalar(inc, 'int32')
    };
    return this.model.executeAsync(dict, OUTPUT_NODE_NAME);
  }
}

window.onload = async () => {
  const resultElement = document.getElementById('result');

  resultElement.innerText = 'Loading Control Flow model...';

  const loopModel = new LoopModel();
  console.time('Loading of model');
  await loopModel.load();
  console.timeEnd('Loading of model');
  resultElement.innerText = 'Model loaded.';

  const runBtn = document.getElementById('run');
  runBtn.onclick = async () => {
    const init = document.getElementById('init').value;
    const loop = document.getElementById('loop').value;
    const inc = document.getElementById('inc').value;
    console.time('prediction');
    const result = await loopModel.predict(init, loop, inc);
    console.timeEnd('prediction');

    resultElement.innerText = "oupput = " + result.dataSync()[0];
  };
};
