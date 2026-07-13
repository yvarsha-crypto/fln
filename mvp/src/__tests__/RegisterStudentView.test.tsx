import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { RegisterStudentView } from '../components/students/RegisterStudentView';
import { UserRole } from '../types';

const mockUser = {
  id: 'u6',
  email: 'teacher@school.com',
  name: 'Test Teacher',
  role: UserRole.TEACHER,
  schoolId: 'gps-mt-001'
};

jest.mock('axios', () => {
  const mockGet = jest.fn((url: string) => {
    if (url === '/api/classes') return Promise.resolve({
      data: [{ id: 'c1', className: 'Class 3', section: 'A', schoolCode: 'gps-mt-001' }]
    });
    if (url === '/api/schools') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });

  return {
    create: () => ({
      defaults: { headers: { common: {} } },
      get: mockGet,
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: { response: { use: jest.fn() } }
    }),
    get: mockGet
  };
});

function renderView(user = mockUser, token = 'test-token') {
  return render(
    <BrowserRouter>
      <RegisterStudentView user={user} token={token} />
    </BrowserRouter>
  );
}

describe('RegisterStudentView', () => {
  it('renders the heading', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('Register Student')).toBeInTheDocument();
    });
  });

  it('shows access restricted for non-teacher/non-volunteer roles', () => {
    renderView({ ...mockUser, role: UserRole.SUPERADMIN });
    expect(screen.getByText('Access Restricted')).toBeInTheDocument();
  });

  it('has required fields', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByLabelText(/student name/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/date of birth/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/identity document type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/parent/i)).toBeInTheDocument();
  });

  it('renders the submit button', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /register ➜/i })).toBeInTheDocument();
    });
  });
});
