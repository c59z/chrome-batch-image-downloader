# Batch Image Downloader

A Chrome extension that saves original images from a page in list order.

1. Open `chrome://extensions/`, enable **Developer mode**, click **Load unpacked**, and select the extension folder.
2. For a local HTML file, open the extension's **Details** and enable **Allow access to file URLs**.
3. Open the source page and click **Batch Image Downloader** in the extensions menu. Click any filename to inspect its original link.
4. Enter a **Folder name**, click **Choose parent folder**, then **Download**. Allow folder and image host access when prompted. Keep the download tab open.

The extension creates the named subfolder or uses it if it already exists. Files are numbered in page order, such as `01_photo.png` and `02_sketch.jpeg`. Existing filenames get a suffix such as ` (1)`. **Retry failed downloads** keeps the original numbering.

By default, the extension scans the list after the **Files** heading. For other layouts, open **Customize image list**, enter a CSS selector such as `ul.gallery li` or `.post__files`, and click **Scan again**. It recognizes direct image links, links around thumbnails, and explicit original-image attributes such as `data-full-url` and `data-zoom-image`. It skips preview-only images.

The sample page links to 11 images plus a cover. Select **Include cover** to save all 12, starting with `01_cover.jpeg`. Downloading the originals requires an internet connection.
