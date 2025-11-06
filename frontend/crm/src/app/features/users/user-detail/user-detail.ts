import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from '../../../shared/services/user';
import { RoleService } from '../../../shared/services/role';


@Component({
  selector: 'app-user-detail',
  templateUrl: './user-detail.html',
  styleUrls: ['./user-detail.scss'],
  standalone:false
})
export class UserDetailComponent implements OnInit {
  user: any;
  userForm: FormGroup;
  isEditMode = false;
  isNewMode = false;
  roles: any[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private userService: UserService,
    private roleService: RoleService
  ) {}

  ngOnInit(): void {
    this.loadRoles();

    const paramId = this.route.snapshot.paramMap.get('id');
    const isNewPath = (this.route.snapshot.routeConfig?.path || '').endsWith('new');
    const isNewUrl = (this.route.snapshot.url || []).some(seg => seg.path === 'new');

    if (paramId === 'new' || isNewPath || isNewUrl) {
      this.isNewMode = true;
      this.initForm();
      return;
    }

    if (paramId) {
      this.loadUser(paramId);
    } else {
      // Fallback: treat as new if no id provided
      this.isNewMode = true;
      this.initForm();
    }
  }

  initForm(user?: any): void {
    const roleId = user?.Role?.id ?? user?.roleId ?? '';
    const isActive = (user?.isActive !== undefined) ? user.isActive : (user?.active !== undefined ? user.active : true);
    this.userForm = this.fb.group({
      firstName: [user?.firstName || '', Validators.required],
      lastName: [user?.lastName || '', Validators.required],
      email: [user?.email || '', [Validators.required, Validators.email]],
      password: [
        '',
        this.isNewMode ? [Validators.required, Validators.minLength(6)] :
                        (this.isEditMode ? [Validators.minLength(6)] : [])
      ],
      role: [roleId, Validators.required],
      active: [isActive]
    });

    if (!this.isNewMode && !this.isEditMode) {
      this.userForm.disable();
    }
  }

  loadRoles(): void {
    this.roleService.getRoles().subscribe({
      next: (data) => {
        this.roles = data;
      },
      error: (error) => {
        console.error('Error loading roles:', error);
      }
    });
  }

  loadUser(userId: string): void {
    this.userService.getUser(parseInt(userId)).subscribe({
      next: (data) => {
        this.user = data;
        this.initForm(this.user);
      },
      error: (error) => {
        console.error('Error loading user:', error);
      }
    });
  }

  toggleEditMode(): void {
    this.isEditMode = !this.isEditMode;
    if (this.isEditMode) {
      this.userForm.enable();
      // Don't require password on edit
      const passwordControl = this.userForm.get('password');
      if (passwordControl) {
        passwordControl.setValidators([Validators.minLength(6)]);
        passwordControl.updateValueAndValidity();
      }
    } else {
      this.userForm.disable();
    }
  }

  onSubmit(): void {
    if (this.userForm.invalid) {
      return;
    }

    const v = this.userForm.value;

    // Build payload to match backend expectations
    const payload: any = {
      firstName: v.firstName,
      lastName: v.lastName,
      email: v.email,
      roleId: Number(v.role),
      isActive: !!v.active
    };
    // Derive a username if not provided in the form (use email local part)
    const emailLocal = (v.email || '').split('@')[0];
    payload.username = emailLocal || `${v.firstName}.${v.lastName}`.replace(/\s+/g, '').toLowerCase();

    // Only include password if it's provided
    if (v.password) {
      payload.password = v.password;
    }

    if (this.isNewMode) {
      this.userService.createUser(payload).subscribe({
        next: () => {
          this.router.navigate(['/users']);
        },
        error: (error) => {
          console.error('Error creating user:', error);
        }
      });
    } else if (this.isEditMode) {
      this.userService.updateUser(this.user.id, payload).subscribe({
        next: () => {
          this.isEditMode = false;
          this.userForm.disable();
          this.loadUser(this.user.id); // Reload user data
        },
        error: (error) => {
          console.error('Error updating user:', error);
        }
      });
    }
  }

  cancel(): void {
    if (this.isNewMode) {
      this.router.navigate(['/users']);
    } else if (this.isEditMode) {
      this.isEditMode = false;
      this.initForm(this.user);
    }
  }
}
