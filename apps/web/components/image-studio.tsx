"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createImageObjectUrlManager } from "@/lib/image-object-url";
import { readImageDimensions, validateImageFile } from "@/lib/image-validation";

export type ImageMode = "portrait" | "full-body";

interface PreparedImage {
  url: string;
  name: string;
  width: number;
  height: number;
}

export function ImageStudio() {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlManagerRef = useRef<ReturnType<typeof createImageObjectUrlManager> | null>(null);
  const [consented, setConsented] = useState(false);
  const [mode, setMode] = useState<ImageMode>("portrait");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => objectUrlManagerRef.current?.dispose(), []);

  async function chooseFile(file?: File) {
    if (!file) return;
    if (!consented) {
      setError("Confirm that you have permission to use this image before selecting it.");
      return;
    }

    const fileValidation = validateImageFile(file);
    if (!fileValidation.ok) {
      setError(
        fileValidation.reason === "too-large"
          ? "Choose an image smaller than 12 MB."
          : "Choose a PNG, JPEG, or WebP image.",
      );
      return;
    }

    try {
      const dimensions = await readImageDimensions(file);
      const objectUrlManager = objectUrlManagerRef.current ??= createImageObjectUrlManager(URL);
      const url = objectUrlManager.create(file);
      setImage({ url, name: file.name, ...dimensions });
      setError("");
    } catch {
      setError("This file could not be decoded as a supported image.");
    }
  }

  function clearImage() {
    objectUrlManagerRef.current?.clear();
    setImage(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section className="panel image-panel" aria-labelledby="image-studio-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">IMAGE STUDIO</p>
          <h2 id="image-studio-title">Your character</h2>
        </div>
        {image ? <span className="ready-badge"><span className="status-dot" /> READY</span> : null}
      </div>

      <div className="mode-switch" role="group" aria-label="Photo type">
        <button
          type="button"
          className={mode === "portrait" ? "mode-option selected" : "mode-option"}
          aria-pressed={mode === "portrait"}
          onClick={() => setMode("portrait")}
        >
          <span className="mode-glyph portrait-glyph" aria-hidden="true" />
          Portrait
        </button>
        <button
          type="button"
          className={mode === "full-body" ? "mode-option selected" : "mode-option"}
          aria-pressed={mode === "full-body"}
          onClick={() => setMode("full-body")}
        >
          <span className="mode-glyph fullbody-glyph" aria-hidden="true" />
          Full body
        </button>
      </div>

      {image ? (
        <div className="image-preview-card">
          <div className="image-preview-frame">
            <Image src={image.url} alt={`${mode === "portrait" ? "Portrait" : "Full-body"} photo preview`} width={image.width} height={image.height} unoptimized />
            <button className="image-remove" type="button" aria-label="Delete uploaded image" onClick={clearImage}>
              ×
            </button>
          </div>
          <div className="image-meta">
            <span className="image-file-name">{image.name}</span>
            <span>{image.width} × {image.height}</span>
          </div>
          <button className="text-action" type="button" onClick={() => inputRef.current?.click()}>
            Replace photo
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="upload-dropzone"
          disabled={!consented}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void chooseFile(event.dataTransfer.files[0]);
          }}
          aria-describedby="upload-privacy"
        >
          <span className="upload-icon" aria-hidden="true">↑</span>
          <strong>Drop your photo here</strong>
          <span>or click to browse</span>
          <small>PNG, JPG or WebP · up to 12 MB</small>
        </button>
      )}
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Choose a portrait or full-body photo"
        onChange={(event) => {
          void chooseFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      <label className="consent-row">
        <input
          type="checkbox"
          checked={consented}
          onChange={(event) => {
            const nextConsented = event.target.checked;
            setConsented(nextConsented);
            if (!nextConsented) clearImage();
          }}
        />
        <span>I own this image or have permission to use this person’s likeness.</span>
      </label>
      <p className="privacy-note" id="upload-privacy">Your photo stays in this browser in this prototype. It is not uploaded or saved.</p>
    </section>
  );
}
