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

import {tidy} from 'deeplearn';

import {NamedTensorMap, NamedTensorsMap} from '../data/index';
import {getNodeNameAndIndex, getTensor} from '../operations/executors/utils';
import * as operations from '../operations/index';

import {ExecutionContext} from './execution_context';

export class GraphExecutor {
  private compiledOrder: operations.Node[] = [];
  private _weightMap: NamedTensorsMap = {};
  private context: ExecutionContext = {frameId: 0, iterationId: 0};
  get weightMap(): NamedTensorsMap {
    return this._weightMap;
  }
  set weightMap(weightMap: NamedTensorsMap) {
    this._weightMap = weightMap;
  }

  constructor(private graph: operations.Graph) {
    this.compile();
  }

  /**
   * Compiles the inference graph to generate the topology order of op nodes,
   * cache the result for inference execution.
   */
  private compile() {
    // Do not compile for graph with control flow, since the execution order
    // requires runtime evaluation of the output tensors.
    if (this.graph.withControlFlow) {
      return;
    }

    const stack = [...this.graph.inputs];
    const visited: {[key: string]: boolean} = {};
    while (stack.length > 0) {
      const node = stack.pop();
      visited[node.name] = true;
      this.compiledOrder.push(node);
      node.children.forEach((childNode) => {
        if (childNode.inputNames.every(name => {
              const [nodeName, index] = getNodeNameAndIndex(name);
              return visited[nodeName];
            })) {
          stack.push(childNode);
        }
      });
    }
  }

  /**
   * Executes the inference for given input tensors.
   * @param inputs Tensor map for the model inputs, keyed by the input node
   * names.
   * @param outputs output node name from the Tensorflow model, if no outputs
   * are specified, the default outputs of the model would be used. You can
   * inspect intermediate nodes of the model by adding them to the outputs
   * array.
   */

  execute(inputs: NamedTensorsMap, outputs?: string|string[]): NamedTensorMap {
    const result = tidy(() => {
      let tensors = {};
      if (this.graph.withControlFlow) {
        tensors = this.executeWithControlFlow(inputs);
      } else {
        tensors = this.compiledOrder.reduce<NamedTensorsMap>((map, node) => {
          map[node.name] = operations.executeOp(node, map);
          return map;
        }, {...this.weightMap, ...inputs});
      }

      if (outputs && !(outputs instanceof Array)) {
        outputs = [outputs];
      }
      const requestedOutputs =
          (outputs || this.graph.outputs.map(node => node.name)) as string[];

      return requestedOutputs.reduce<NamedTensorMap>((map, name) => {
        map[name] = getTensor(name, tensors);
        return map;
      }, {});
    });
    return result;
  }

  private executeWithControlFlow(inputs: NamedTensorsMap): NamedTensorsMap {
    const stack = [...this.graph.inputs];
    const tensorMap = {...this.weightMap, ...inputs};

    while (stack.length > 0) {
      const node = stack.pop();
      tensorMap[node.name] = operations.executeOp(node, tensorMap);

      node.children.forEach((childNode) => {
        // Merge op can be push if any of its inputs has value.
        if (childNode.op === 'Merge') {
          if (childNode.inputNames.some(name => {
                const [nodeName, index] = getNodeNameAndIndex(name);
                return getTensor(name, tensorMap) !== undefined;
              })) {
            stack.push(childNode);
          }
          // Otherwise all inputs need to have value.
        } else if (childNode.inputNames.every(name => {
                     const [nodeName, index] = getNodeNameAndIndex(name);
                     return getTensor(name, tensorMap) !== undefined;
                   })) {
          stack.push(childNode);
        }
      });
    }

    return tensorMap;
  }

  /**
   * Releases the memory used by the weight tensors.
   */
  dispose() {
    Object.keys(this.weightMap)
        .forEach(
            key => this.weightMap[key].forEach(tensor => tensor.dispose()));
  }
}
