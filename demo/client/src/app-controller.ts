// pathfinder/client/src/app-controller.ts
//
// Copyright © 2017 The Pathfinder Project Developers.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

import {AntialiasingStrategyName} from "./aa-strategy";
import {ShaderLoader, ShaderMap, ShaderProgramSource} from './shader-loader';
import {expectNotNull, unwrapUndef, unwrapNull} from './utils';
import { PathfinderDemoView, Timings, TIMINGS } from "./view";

export abstract class AppController {
    start() {
        const canvas = document.getElementById('pf-canvas') as HTMLCanvasElement;
    }

    protected loadInitialFile() {
        const selectFileElement = document.getElementById('pf-select-file') as
            (HTMLSelectElement | null);
        if (selectFileElement != null) {
            const selectedOption = selectFileElement.selectedOptions[0] as HTMLOptionElement;
            this.fetchFile(selectedOption.value);
        } else {
            this.fetchFile(this.defaultFile);
        }
    }

    protected fetchFile(file: string) {
        window.fetch(`${this.builtinFileURI}/${file}`)
              .then(response => response.arrayBuffer())
              .then(data => {
                  this.fileData = data;
                  this.fileLoaded();
              });
    }

    protected canvas: HTMLCanvasElement;

    protected screenshotButton: HTMLButtonElement | null;

    protected fileData: ArrayBuffer;

    protected abstract fileLoaded(): void;

    protected abstract get defaultFile(): string;
    protected abstract get builtinFileURI(): string;
}

export abstract class DemoAppController<View extends PathfinderDemoView> extends AppController {
    constructor() {
        super();
    }

    start() {
        super.start();

        const settingsCard = document.getElementById('pf-settings') as (HTMLElement | null);
        const settingsButton = document.getElementById('pf-settings-button') as
            (HTMLButtonElement | null);
        const settingsCloseButton = document.getElementById('pf-settings-close-button') as
            (HTMLButtonElement | null);

        if (settingsButton != null) {
            settingsButton.addEventListener('click', event => {
                event.stopPropagation();
                unwrapNull(settingsCard).classList.toggle('pf-invisible');
            }, false);
        }
        if (settingsCloseButton != null) {
            settingsCloseButton.addEventListener('click', () => {
                unwrapNull(settingsCard).classList.add('pf-invisible');
            }, false);
        }
        if (settingsCard != null) {
            document.body.addEventListener('click', () => {
                settingsCard.classList.add('pf-invisible');
            }, false);
            settingsCard.addEventListener('click', event => event.stopPropagation(), false);
        }

        const screenshotButton = document.getElementById('pf-screenshot-button') as
            HTMLButtonElement | null;
        if (screenshotButton != null) {
            screenshotButton.addEventListener('click', () => {
                this.view.then(view => view.queueScreenshot());
            }, false);
        }

        const zoomInButton = document.getElementById('pf-zoom-in-button') as HTMLButtonElement |
            null;
        if (zoomInButton != null) {
            zoomInButton.addEventListener('click', () => {
                this.view.then(view => view.zoomIn());
            }, false);
        }

        const zoomOutButton = document.getElementById('pf-zoom-out-button') as HTMLButtonElement |
            null;
        if (zoomOutButton != null) {
            zoomOutButton.addEventListener('click', () => {
                this.view.then(view => view.zoomOut());
            }, false);
        }

        this.filePickerElement = document.getElementById('pf-file-select') as
            (HTMLInputElement | null);
        if (this.filePickerElement != null) {
            this.filePickerElement.addEventListener('change',
                                                    event => this.loadFile(event),
                                                    false);
        }

        const selectFileElement = document.getElementById('pf-select-file') as
            (HTMLSelectElement | null);
        if (selectFileElement != null) {
            selectFileElement.addEventListener('click',
                                               event => this.fileSelectionChanged(event),
                                               false);
        }

        this.fpsLabel = document.getElementById('pf-fps-label');

        const shaderLoader = new ShaderLoader;
        shaderLoader.load();

        this.view = Promise.all([shaderLoader.common, shaderLoader.shaders]).then(allShaders => {
            this.commonShaderSource = allShaders[0];
            this.shaderSources = allShaders[1];
            return this.createView();
        });

        this.aaLevelSelect = document.getElementById('pf-aa-level-select') as
            (HTMLSelectElement | null);
        if (this.aaLevelSelect != null)
            this.aaLevelSelect.addEventListener('change', () => this.updateAALevel(), false);

        this.subpixelAASwitch =
            document.getElementById('pf-subpixel-aa') as HTMLInputElement | null;
        if (this.subpixelAASwitch != null)
            this.subpixelAASwitch.addEventListener('change', () => this.updateAALevel(), false);

        this.updateAALevel();
    }

    newTimingsReceived(timings: Timings) {
        if (this.fpsLabel == null)
            return;

        while (this.fpsLabel.lastChild != null)
            this.fpsLabel.removeChild(this.fpsLabel.lastChild);

        for (const timing of Object.keys(timings) as Array<keyof Timings>) {
            const tr = document.createElement('div');
            tr.classList.add('row');

            const keyTD = document.createElement('div');
            const valueTD = document.createElement('div');
            keyTD.classList.add('col');
            valueTD.classList.add('col');
            keyTD.appendChild(document.createTextNode(TIMINGS[timing]));
            valueTD.appendChild(document.createTextNode(timings[timing] + " ms"));

            tr.appendChild(keyTD);
            tr.appendChild(valueTD);
            this.fpsLabel.appendChild(tr);
        }

        this.fpsLabel.classList.remove('invisible');
    }

    private updateAALevel() {
        let aaType: AntialiasingStrategyName, aaLevel: number;
        if (this.aaLevelSelect != null) {
            const selectedOption = this.aaLevelSelect.selectedOptions[0];
            const aaValues = unwrapNull(/^([a-z-]+)(?:-([0-9]+))?$/.exec(selectedOption.value));
            aaType = aaValues[1] as AntialiasingStrategyName;
            aaLevel = aaValues[2] === "" ? 1 : parseInt(aaValues[2]);
        } else {
            aaType = 'none';
            aaLevel = 0;
        }

        const subpixelAA = this.subpixelAASwitch == null ? false : this.subpixelAASwitch.checked;
        this.view.then(view => view.setAntialiasingOptions(aaType, aaLevel, subpixelAA));
    }

    protected loadFile(event: Event) {
        const filePickerElement = event.target as HTMLInputElement;
        const file = expectNotNull(filePickerElement.files, "No file selected!")[0];
        const reader = new FileReader;
        reader.addEventListener('loadend', () => {
            this.fileData = reader.result;
            this.fileLoaded();
        }, false);
        reader.readAsArrayBuffer(file);
    }

    private fileSelectionChanged(event: Event) {
        const selectFileElement = event.currentTarget as HTMLSelectElement;
        const selectedOption = selectFileElement.selectedOptions[0] as HTMLOptionElement;

        if (selectedOption.value === 'load-custom' && this.filePickerElement != null) {
            this.filePickerElement.click();

            const oldSelectedIndex = selectFileElement.selectedIndex;
            const newOption = document.createElement('option');
            newOption.id = 'pf-custom-option-placeholder';
            newOption.appendChild(document.createTextNode("Custom"));
            selectFileElement.insertBefore(newOption, selectedOption);
            selectFileElement.selectedIndex = oldSelectedIndex;
            return;
        }

        // Remove the "Custom…" placeholder if it exists.
        const placeholder = document.getElementById('pf-custom-option-placeholder');
        if (placeholder != null)
            selectFileElement.removeChild(placeholder);

        // Fetch the file.
        this.fetchFile(selectedOption.value);
    }

    protected abstract createView(): View;

    view: Promise<View>;

    protected filePickerElement: HTMLInputElement | null;

    protected commonShaderSource: string | null;
    protected shaderSources: ShaderMap<ShaderProgramSource> | null;

    private aaLevelSelect: HTMLSelectElement | null;
    private subpixelAASwitch: HTMLInputElement | null;
    private fpsLabel: HTMLElement | null;
}
