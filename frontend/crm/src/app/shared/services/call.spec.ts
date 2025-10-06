import { TestBed } from '@angular/core/testing';

import { Call } from './call';

describe('Call', () => {
  let service: Call;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Call);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
