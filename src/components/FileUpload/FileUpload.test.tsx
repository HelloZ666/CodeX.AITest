import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FileUploadComponent from './FileUpload';

describe('FileUpload', () => {
  const mockOnFilesReady = vi.fn();

  beforeEach(() => {
    mockOnFilesReady.mockClear();
  });

  it('renders two upload slots and a disabled submit button initially', () => {
    render(<FileUploadComponent onFilesReady={mockOnFilesReady} />);

    expect(screen.getByText('代码改动文件')).toBeInTheDocument();
    expect(screen.getByText('测试用例文件')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /开始智能分析/ })).toBeDisabled();
  });

  it('moves file format descriptions into the upload modal', async () => {
    render(<FileUploadComponent onFilesReady={mockOnFilesReady} />);

    expect(screen.queryByText(/仅支持 `.json`/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /上传文件/ }));

    expect(await screen.findByText('上传说明')).toBeInTheDocument();
    expect(screen.getByText(/代码改动文件仅支持/)).toBeInTheDocument();
    expect(screen.getByText(/测试用例文件支持/)).toBeInTheDocument();
  });

  it('enables submit button after all files are selected in the modal', async () => {
    render(<FileUploadComponent onFilesReady={mockOnFilesReady} />);
    fireEvent.click(screen.getByRole('button', { name: /上传文件/ }));

    const uploadInputs = document.body.querySelectorAll('input[type="file"]');
    expect(uploadInputs.length).toBe(2);

    const codeFile = new File(['{"current":[]}'], 'code.json', { type: 'application/json' });
    const testFile = new File(['id,name'], 'tests.csv', { type: 'text/csv' });

    fireEvent.change(uploadInputs[0], { target: { files: [codeFile] } });
    fireEvent.change(uploadInputs[1], { target: { files: [testFile] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /开始智能分析/ })).not.toBeDisabled();
    });
  });

  it('calls onFilesReady when submit is clicked with all files', async () => {
    render(<FileUploadComponent onFilesReady={mockOnFilesReady} />);
    fireEvent.click(screen.getByRole('button', { name: /上传文件/ }));

    const uploadInputs = document.body.querySelectorAll('input[type="file"]');
    const codeFile = new File(['{"current":[]}'], 'code.json', { type: 'application/json' });
    const testFile = new File(['id,name'], 'tests.csv', { type: 'text/csv' });

    fireEvent.change(uploadInputs[0], { target: { files: [codeFile] } });
    fireEvent.change(uploadInputs[1], { target: { files: [testFile] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /开始智能分析/ })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /开始智能分析/ }));

    await waitFor(() => {
      expect(mockOnFilesReady).toHaveBeenCalledTimes(1);
      expect(mockOnFilesReady).toHaveBeenCalledWith({
        codeChanges: expect.any(File),
        testCases: expect.any(File),
      });
    });
  });
});
