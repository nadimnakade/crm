import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RoleService } from '../../../shared/services/role';


@Component({
  selector: 'app-role-detail',
  templateUrl: './role-detail.html',
  styleUrls: ['./role-detail.scss'],
  standalone: false
})
export class RoleDetailComponent implements OnInit {
  role: any;
  roleForm: FormGroup;
  isEditMode = false;
  isNewMode = false;
  permissions: any[] = [];
  selectedPermissions: string[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private roleService: RoleService
  ) {}

  ngOnInit(): void {
    this.loadPermissions();

    const roleId = this.route.snapshot.paramMap.get('id');
    if (roleId === 'new') {
      this.isNewMode = true;
      this.initForm();
    } else if (roleId) {
      this.loadRole(parseInt(roleId) );
    }
  }

  initForm(role?: any): void {
    this.roleForm = this.fb.group({
      name: [role?.name || '', Validators.required],
      description: [role?.description || '']
    });

    if (role?.permissions) {
      this.selectedPermissions = [...role.permissions];
    } else {
      this.selectedPermissions = [];
    }

    if (!this.isNewMode && !this.isEditMode) {
      this.roleForm.disable();
    }
  }

  loadPermissions(): void {
    this.roleService.getPermissions().subscribe({
      next: (data) => {
        this.permissions = data;
      },
      error: (error) => {
        console.error('Error loading permissions:', error);
      }
    });
  }

  loadRole(roleId: number): void {
    this.roleService.getRole(roleId).subscribe({
      next: (data) => {
        this.role = data;
        this.initForm(this.role);
      },
      error: (error) => {
        console.error('Error loading role:', error);
      }
    });
  }

  toggleEditMode(): void {
    this.isEditMode = !this.isEditMode;
    if (this.isEditMode) {
      this.roleForm.enable();
    } else {
      this.roleForm.disable();
    }
  }

  isPermissionSelected(permissionId: string): boolean {
    return this.selectedPermissions.includes(permissionId);
  }

  togglePermission(permissionId: string): void {
    if (!this.isNewMode && !this.isEditMode) {
      return;
    }

    const index = this.selectedPermissions.indexOf(permissionId);
    if (index === -1) {
      this.selectedPermissions.push(permissionId);
    } else {
      this.selectedPermissions.splice(index, 1);
    }
  }

  onSubmit(): void {
    if (this.roleForm.invalid) {
      return;
    }

    const roleData = {
      ...this.roleForm.value,
      permissions: this.selectedPermissions
    };

    if (this.isNewMode) {
      this.roleService.createRole(roleData).subscribe({
        next: (response) => {
          this.router.navigate(['/roles']);
        },
        error: (error) => {
          console.error('Error creating role:', error);
        }
      });
    } else if (this.isEditMode) {
      this.roleService.updateRole(this.role.id, roleData).subscribe({
        next: (response) => {
          this.isEditMode = false;
          this.roleForm.disable();
          this.loadRole(this.role.id); // Reload role data
        },
        error: (error) => {
          console.error('Error updating role:', error);
        }
      });
    }
  }

  cancel(): void {
    if (this.isNewMode) {
      this.router.navigate(['/roles']);
    } else if (this.isEditMode) {
      this.isEditMode = false;
      this.initForm(this.role);
    }
  }
}
