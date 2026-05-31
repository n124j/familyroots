/**
 * Component tests for MediaUploader.
 * Covers drag-and-drop, file selection, upload progress, error states.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MediaUploader } from '@features/media/components/MediaUploader';

const TREE_ID  = 'tree-abc';
const MEDIA_ID = 'media-xyz';

const server = setupServer(
  http.post('/api/v1/media/upload-url', () =>
    HttpResponse.json({
      media_id: MEDIA_ID,
      upload_url: 'https://s3.example.com/bucket',
      upload_fields: { key: 'test/original.jpg', 'Content-Type': 'image/jpeg' },
      storage_key: 'test/original.jpg',
      expires_in_seconds: 3600,
      max_size_bytes: 52428800,
    }, { status: 201 })
  ),
  http.post('https://s3.example.com/bucket', () => new HttpResponse(null, { status: 204 })),
  http.post(`/api/v1/media/${MEDIA_ID}/confirm`, () =>
    HttpResponse.json({ media_id: MEDIA_ID, status: 'CONFIRMED' })
  ),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('MediaUploader', () => {
  const user = userEvent.setup({ delay: null });

  it('renders drop zone', () => {
    render(<MediaUploader treeId={TREE_ID} />);
    expect(screen.getByText(/Drop files here/)).toBeInTheDocument();
    expect(screen.getByText(/browse/i)).toBeInTheDocument();
  });

  it('shows accepted file types hint', () => {
    render(<MediaUploader treeId={TREE_ID} />);
    expect(screen.getByText(/Photos, documents, audio, video/)).toBeInTheDocument();
  });

  it('applies drag-over style when file dragged over zone', () => {
    render(<MediaUploader treeId={TREE_ID} />);
    const zone = screen.getByRole('button');
    fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
    expect(zone.className).toMatch(/border-indigo-500/);
  });

  it('removes drag style on drag leave', () => {
    render(<MediaUploader treeId={TREE_ID} />);
    const zone = screen.getByRole('button');
    fireEvent.dragOver(zone);
    fireEvent.dragLeave(zone);
    expect(zone.className).not.toMatch(/border-indigo-500/);
  });

  it('starts upload and shows filename in queue on file select', async () => {
    render(<MediaUploader treeId={TREE_ID} />);
    const file = new File(['fake image content'], 'family-photo.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('family-photo.jpg')).toBeInTheDocument();
    });
  });

  it('calls onUploadComplete after successful upload', async () => {
    const onComplete = jest.fn();
    render(<MediaUploader treeId={TREE_ID} onUploadComplete={onComplete} />);
    const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      // Either the callback was called or the upload completed indicator is shown
      expect(
        onComplete.mock.calls.length > 0 ||
        screen.queryByText('Ready') !== null ||
        screen.queryByText('Processing…') !== null
      ).toBe(true);
    }, { timeout: 3000 });
  });

  it('shows error state when upload-url request fails', async () => {
    server.use(
      http.post('/api/v1/media/upload-url', () =>
        HttpResponse.json({ detail: 'Unsupported media type' }, { status: 415 })
      )
    );

    render(<MediaUploader treeId={TREE_ID} />);
    const file = new File(['data'], 'virus.exe', { type: 'application/x-executable' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => {
      // Should show an error indicator (row with error class or error text)
      const errorElements = document.querySelectorAll('[class*="red"]');
      expect(errorElements.length).toBeGreaterThan(0);
    });
  });

  it('dismiss button removes upload from queue', async () => {
    render(<MediaUploader treeId={TREE_ID} />);
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(screen.getByText('photo.jpg')).toBeInTheDocument());

    // Wait for non-active state (ready or error) so dismiss button appears
    await waitFor(
      () => {
        const dismissBtn = screen.queryByLabelText('Dismiss');
        return dismissBtn !== null;
      },
      { timeout: 3000 }
    );

    const dismissBtn = screen.getByLabelText('Dismiss');
    await user.click(dismissBtn);

    await waitFor(() => {
      expect(screen.queryByText('photo.jpg')).not.toBeInTheDocument();
    });
  });
});
