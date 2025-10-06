import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CallDetail } from './call-detail';

describe('CallDetail', () => {
  let component: CallDetail;
  let fixture: ComponentFixture<CallDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CallDetail]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CallDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
